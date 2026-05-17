<?php

declare(strict_types=1);

// Set error handling before any output
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Header must be first
header('Content-Type: text/xml; charset=utf-8');

// Then load dependencies with error suppression
require_once __DIR__ . '/prestashop-webservice.php';

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo '<?xml version="1.0" encoding="UTF-8"?><prestashop><error>Method not allowed</error></prestashop>';
    exit;
}

$protectedCategoryIds = [1, 2];
$protectedCustomerIds = [1];

function reset_normalize_ids(array $ids): array
{
    $ids = array_values(array_unique(array_filter(array_map('intval', $ids), static fn (int $id): bool => $id > 0)));
    sort($ids);

    return $ids;
}

function reset_list_ids_safe(string $resource, array &$skipped): array
{
    try {
        return ps_list_ids($resource);
    } catch (Throwable $exception) {
        $skipped[] = $resource . ' non liste via API XML: ' . $exception->getMessage();
        return [];
    }
}

function reset_delete_ids(string $resource, array $ids, array &$deleted, array &$failed): void
{
    $ids = reset_normalize_ids($ids);
    foreach ($ids as $id) {
        try {
            ps_delete_resource($resource, $id);
            $deleted[$resource] = ($deleted[$resource] ?? 0) + 1;
        } catch (Throwable $exception) {
            $failed[] = $resource . '/' . $id . ': ' . $exception->getMessage();
        }
    }
}

function reset_protected_customer_data(array $protectedCustomerIds, array &$skipped): array
{
    $protected = [
        'customers' => [],
        'addresses' => [],
        'carts' => [],
        'orders' => [],
        'order_histories' => [],
        'order_payments' => [],
        'order_details' => [],
        'order_carriers' => [],
        'order_cart_rules' => [],
        'order_invoices' => [],
        'order_slips' => [],
    ];

    $orderReferences = [];

    foreach (reset_normalize_ids($protectedCustomerIds) as $customerId) {
        $protected['customers'][] = $customerId;
        $skipped[] = 'customer ' . $customerId . ' protected';

        foreach (['addresses', 'carts', 'orders'] as $resource) {
            $ids = ps_find_ids_by_field($resource, 'id_customer', $customerId);
            if ($ids) {
                $protected[$resource] = array_merge($protected[$resource], $ids);
            }
        }

        foreach (ps_list_full_nodes('orders', ['filter[id_customer]' => ps_filter_value($customerId)]) as $order) {
            $orderId = (int) ps_text($order, 'id');
            if ($orderId > 0) {
                $protected['orders'][] = $orderId;
            }

            $reference = ps_text($order, 'reference');
            if ($reference !== '') {
                $orderReferences[] = $reference;
            }
        }
    }

    foreach (reset_normalize_ids($protected['orders']) as $orderId) {
        foreach (['order_histories', 'order_details', 'order_carriers', 'order_cart_rules', 'order_invoices', 'order_slips'] as $resource) {
            $ids = ps_find_ids_by_field($resource, 'id_order', $orderId);
            if ($ids) {
                $protected[$resource] = array_merge($protected[$resource], $ids);
            }
        }
    }

    foreach (array_values(array_unique(array_filter($orderReferences))) as $reference) {
        $ids = ps_find_ids_by_field('order_payments', 'order_reference', $reference);
        if ($ids) {
            $protected['order_payments'] = array_merge($protected['order_payments'], $ids);
        }
    }

    foreach ($protected as $resource => $ids) {
        $protected[$resource] = reset_normalize_ids($ids);
    }

    return $protected;
}

function reset_category_ids(array $protectedCategoryIds, array &$skipped): array
{
    try {
        $categories = [];
        foreach (ps_list_full_nodes('categories') as $category) {
            $id = (int) ps_text($category, 'id');
            if ($id <= 0 || in_array($id, $protectedCategoryIds, true)) {
                continue;
            }

            $categories[] = [
                'id' => $id,
                'level_depth' => (int) ps_text($category, 'level_depth'),
            ];
        }

        usort(
            $categories,
            static fn (array $a, array $b): int => [$b['level_depth'], $b['id']] <=> [$a['level_depth'], $a['id']]
        );

        return array_map(static fn (array $category): int => $category['id'], $categories);
    } catch (Throwable $exception) {
        $skipped[] = 'categories non listees via API XML: ' . $exception->getMessage();
        return [];
    }
}

try {
    $deleted = [];
    $skipped = [];
    $failed = [];
    $protectedCustomerData = reset_protected_customer_data($protectedCustomerIds, $skipped);

    // Step 1: Delete order-related data (respects protected customers automatically)
    $orderDeletions = [
        'order_histories',
        'order_payments',
        'order_details',
        'order_carriers',
        'order_cart_rules',
        'order_invoices',
        'order_slips',
        'orders',
    ];

    foreach ($orderDeletions as $resource) {
        $ids = reset_list_ids_safe($resource, $skipped);
        if (!empty($protectedCustomerData[$resource])) {
            $ids = array_values(array_diff($ids, $protectedCustomerData[$resource]));
        }
        reset_delete_ids($resource, $ids, $deleted, $failed);
    }

    // Step 2: Delete cart-related data (respects protected customers)
    $cartDeletions = [
        'cart_rules',
        'carts',
        'addresses',
        'customers',
    ];

    foreach ($cartDeletions as $resource) {
        $ids = reset_list_ids_safe($resource, $skipped);
        if (!empty($protectedCustomerData[$resource])) {
            $ids = array_values(array_diff($ids, $protectedCustomerData[$resource]));
        }
        reset_delete_ids($resource, $ids, $deleted, $failed);
    }

    // Step 3: Delete images before products/combinations
    try {
        $productIds = reset_list_ids_safe('products', $skipped);
        $protectedProducts = $protectedCustomerData['products'] ?? [];
        $productsToDelete = array_values(array_diff($productIds, $protectedProducts));
        
        if (!empty($productsToDelete)) {
            foreach ($productsToDelete as $productId) {
                try {
                    $imageIds = ps_find_ids_by_field('images', 'id_product', $productId);
                    if (!empty($imageIds)) {
                        foreach ($imageIds as $imageId) {
                            try {
                                ps_delete_resource('images', $imageId);
                                $deleted['images'] = ($deleted['images'] ?? 0) + 1;
                            } catch (Throwable $e) {
                                $failed[] = 'images/' . $imageId . ': ' . $e->getMessage();
                            }
                        }
                    }
                } catch (Throwable $e) {
                    // Silently skip if finding images fails
                }
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'images: ' . $e->getMessage();
    }

    // Step 4: Delete stock_availables before combinations/products
    $stockIds = reset_list_ids_safe('stock_availables', $skipped);
    reset_delete_ids('stock_availables', $stockIds, $deleted, $failed);

    // Step 5: Delete combinations before products
    $combinationIds = reset_list_ids_safe('combinations', $skipped);
    reset_delete_ids('combinations', $combinationIds, $deleted, $failed);

    // Step 6: Delete products
    $ids = reset_list_ids_safe('products', $skipped);
    if (!empty($protectedCustomerData['products'])) {
        $ids = array_values(array_diff($ids, $protectedCustomerData['products']));
    }
    reset_delete_ids('products', $ids, $deleted, $failed);

    // Step 7: Delete product options and values
    $optionDeletions = [
        'product_option_values',
        'product_options',
    ];

    foreach ($optionDeletions as $resource) {
        $ids = reset_list_ids_safe($resource, $skipped);
        reset_delete_ids($resource, $ids, $deleted, $failed);
    }

    // Step 8: Delete tax-related data
    $taxDeletions = [
        'tax_rules',
        'tax_rule_groups',
        'taxes',
    ];

    foreach ($taxDeletions as $resource) {
        $ids = reset_list_ids_safe($resource, $skipped);
        reset_delete_ids($resource, $ids, $deleted, $failed);
    }

    // Step 9: Delete categories (except protected ones)
    reset_delete_ids('categories', reset_category_ids($protectedCategoryIds, $skipped), $deleted, $failed);

    foreach ($protectedCategoryIds as $id) {
        $skipped[] = 'category ' . $id . ' protected';
    }

    $deletedCount = array_sum($deleted);
    $failedCount = count($failed);
    // Success = at least something was deleted (partial reset is acceptable)
    $success = $deletedCount > 0 || $failedCount === 0;
    $message = $failedCount > 0
        ? 'Reset API XML termine: ' . $deletedCount . ' element(s) supprime(s), ' . $failedCount . ' echec(s) (certaines donnees protegees peuvent rester).'
        : 'Reset API XML termine: ' . $deletedCount . ' element(s) supprime(s). Categories 1 et 2, customer 1 et ses donnees liees sont conservees.';

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<prestashop success="' . ($success ? '1' : '0') . '" deletedCount="' . $deletedCount . '" skippedCount="' . count($skipped) . '" failedCount="' . $failedCount . '">' . "\n";
    $xml .= '  <message>' . htmlspecialchars($message, ENT_XML1, 'UTF-8') . '</message>' . "\n";
    $xml .= '  <details>' . "\n";
    
    // Deleted items
    $xml .= '    <deleted>' . "\n";
    foreach ($deleted as $resource => $count) {
        $xml .= '      <item resource="' . htmlspecialchars($resource, ENT_XML1, 'UTF-8') . '">' . $count . '</item>' . "\n";
    }
    $xml .= '    </deleted>' . "\n";
    
    // Skipped items
    $xml .= '    <skipped>' . "\n";
    foreach ($skipped as $skip) {
        $xml .= '      <item>' . htmlspecialchars($skip, ENT_XML1, 'UTF-8') . '</item>' . "\n";
    }
    $xml .= '    </skipped>' . "\n";
    
    // Failed items
    $xml .= '    <failed>' . "\n";
    foreach ($failed as $fail) {
        $xml .= '      <item>' . htmlspecialchars($fail, ENT_XML1, 'UTF-8') . '</item>' . "\n";
    }
    $xml .= '    </failed>' . "\n";
    
    $xml .= '  </details>' . "\n";
    $xml .= '</prestashop>';
    
    echo $xml;
} catch (Throwable $exception) {
    http_response_code(500);
    $errorMessage = $exception->getMessage();
    $errorClass = get_class($exception);
    $errorLine = $exception->getLine();
    $errorFile = $exception->getFile();
    
    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<prestashop success="0" failedCount="1">' . "\n";
    $xml .= '  <message>' . htmlspecialchars("Erreur reset API XML: {$errorMessage}", ENT_XML1, 'UTF-8') . '</message>' . "\n";
    $xml .= '  <details>' . "\n";
    $xml .= '    <error>' . "\n";
    $xml .= '      <class>' . htmlspecialchars($errorClass, ENT_XML1, 'UTF-8') . '</class>' . "\n";
    $xml .= '      <file>' . htmlspecialchars($errorFile, ENT_XML1, 'UTF-8') . '</file>' . "\n";
    $xml .= '      <line>' . $errorLine . '</line>' . "\n";
    $xml .= '    </error>' . "\n";
    $xml .= '  </details>' . "\n";
    $xml .= '</prestashop>';
    
    echo $xml;
}

