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
            // ✅ Format meilleur: resource/id
            $error = trim($exception->getMessage());
            $failed[] = $resource . '/' . $id . ': ' . ($error ?: 'Erreur inconnue');
        }
    }
}

function reset_update_stock_quantities(array $ids, array &$updated, array &$failed): void
{
    $ids = reset_normalize_ids($ids);
    foreach ($ids as $id) {
        try {
            $xml = '<?xml version="1.0" encoding="UTF-8"?><prestashop><stock_available><id>'
                . $id
                . '</id><quantity>0</quantity></stock_available></prestashop>';
            ps_patch_resource_xml('stock_availables', $id, $xml);
            $updated['stock_availables'] = ($updated['stock_availables'] ?? 0) + 1;
        } catch (Throwable $exception) {
            $error = trim($exception->getMessage());
            $failed[] = 'stock_availables/' . $id . ': ' . ($error ?: 'Erreur inconnue');
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
        'order_slip' => [],
        'products' => [],
        'combinations' => [],
        'stock_availables' => [],
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
        foreach (['order_histories', 'order_details', 'order_carriers', 'order_cart_rules', 'order_invoices', 'order_slip'] as $resource) {
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

    // ✅ Protéger les produits des commandes protégées
    foreach (reset_normalize_ids($protected['orders']) as $orderId) {
        $productIds = ps_find_ids_by_field('order_details', 'id_order', $orderId);
        if ($productIds) {
            // order_details contient id_order + id_product, chercher les produits
            foreach (ps_list_full_nodes('order_details', ['filter[id_order]' => ps_filter_value($orderId)]) as $detail) {
                $productId = (int) ps_text($detail, 'product_id');
                if ($productId > 0) {
                    $protected['products'][] = $productId;
                }
            }
        }
    }

    // ✅ Protéger les combinations des produits protégés
    foreach (reset_normalize_ids($protected['products']) as $productId) {
        $combinationIds = ps_find_ids_by_field('combinations', 'id_product', $productId);
        if ($combinationIds) {
            $protected['combinations'] = array_merge($protected['combinations'], $combinationIds);
        }
    }

    // ✅ Protéger les stocks des produits protégés
    foreach (reset_normalize_ids($protected['products']) as $productId) {
        $stockIds = ps_find_ids_by_field('stock_availables', 'id_product', $productId);
        if ($stockIds) {
            $protected['stock_availables'] = array_merge($protected['stock_availables'], $stockIds);
        }
    }
    // ✅ Protéger aussi les stocks des combinations protégées
    foreach (reset_normalize_ids($protected['combinations']) as $combinationId) {
        $stockIds = ps_find_ids_by_field('stock_availables', 'id_product_attribute', $combinationId);
        if ($stockIds) {
            $protected['stock_availables'] = array_merge($protected['stock_availables'], $stockIds);
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

function reset_xml_response(bool $success, string $message, array $deleted, array $updated, array $skipped, array $failed): string
{
    $deletedCount = array_sum($deleted);
    $updatedCount = array_sum($updated);

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<prestashop success="' . ($success ? '1' : '0') . '" deletedCount="' . $deletedCount . '" updatedCount="' . $updatedCount . '" skippedCount="' . count($skipped) . '" failedCount="' . count($failed) . '">' . "\n";
    $xml .= '  <message>' . htmlspecialchars($message, ENT_XML1, 'UTF-8') . '</message>' . "\n";
    $xml .= '  <details>' . "\n";
    $xml .= '    <deleted>' . "\n";
    foreach ($deleted as $resource => $count) {
        $xml .= '      <item resource="' . htmlspecialchars($resource, ENT_XML1, 'UTF-8') . '">' . (int) $count . '</item>' . "\n";
    }
    $xml .= '    </deleted>' . "\n";
    $xml .= '    <updated>' . "\n";
    foreach ($updated as $resource => $count) {
        $xml .= '      <item resource="' . htmlspecialchars($resource, ENT_XML1, 'UTF-8') . '">' . (int) $count . '</item>' . "\n";
    }
    $xml .= '    </updated>' . "\n";
    $xml .= '    <skipped>' . "\n";
    foreach ($skipped as $skip) {
        $xml .= '      <item>' . htmlspecialchars($skip, ENT_XML1, 'UTF-8') . '</item>' . "\n";
    }
    $xml .= '    </skipped>' . "\n";
    $xml .= '    <failed>' . "\n";
    foreach ($failed as $fail) {
        $xml .= '      <item>' . htmlspecialchars($fail, ENT_XML1, 'UTF-8') . '</item>' . "\n";
    }
    $xml .= '    </failed>' . "\n";
    $xml .= '  </details>' . "\n";
    $xml .= '</prestashop>';

    return $xml;
}

function reset_fast_table_exists(PDO $pdo, string $prefix, string $table): bool
{
    static $cache = [];
    $fullName = $prefix . $table;
    if (array_key_exists($fullName, $cache)) {
        return $cache[$fullName];
    }

    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = :table');
    $stmt->execute(['table' => $fullName]);
    $cache[$fullName] = (int) $stmt->fetchColumn() > 0;

    return $cache[$fullName];
}

function reset_fast_delete(PDO $pdo, string $prefix, string $table, array &$deleted, array &$skipped, string $where = '1=1', array $params = []): void
{
    if (!reset_fast_table_exists($pdo, $prefix, $table)) {
        $skipped[] = $prefix . $table . ' absente';
        return;
    }

    $stmt = $pdo->prepare('DELETE FROM `' . $prefix . $table . '` WHERE ' . $where);
    $stmt->execute($params);
    $count = $stmt->rowCount();
    if ($count > 0) {
        $deleted[$table] = ($deleted[$table] ?? 0) + $count;
    }
}

function reset_fast_auto_increment(PDO $pdo, string $prefix, string $table, int $nextId, array &$skipped): void
{
    if (!reset_fast_table_exists($pdo, $prefix, $table)) {
        return;
    }

    try {
        $pdo->exec('ALTER TABLE `' . $prefix . $table . '` AUTO_INCREMENT = ' . $nextId);
    } catch (Throwable $exception) {
        $skipped[] = $prefix . $table . ' auto_increment ignore: ' . $exception->getMessage();
    }
}

function reset_fast_image_path(int $imageId): string
{
    return implode(DIRECTORY_SEPARATOR, str_split((string) $imageId));
}

function reset_fast_delete_image_files(array $imageIds, array &$deleted): void
{
    $baseDir = realpath(__DIR__ . '/../../eval/img/p');
    if ($baseDir === false) {
        return;
    }

    foreach ($imageIds as $imageId) {
        $imageId = (int) $imageId;
        if ($imageId <= 0) {
            continue;
        }

        $dir = $baseDir . DIRECTORY_SEPARATOR . reset_fast_image_path($imageId);
        foreach (glob($dir . DIRECTORY_SEPARATOR . $imageId . '*') ?: [] as $file) {
            if (is_file($file) && @unlink($file)) {
                $deleted['image_files'] = ($deleted['image_files'] ?? 0) + 1;
            }
        }

        while ($dir !== $baseDir && is_dir($dir)) {
            $items = array_diff(scandir($dir) ?: [], ['.', '..']);
            if ($items) {
                break;
            }
            @rmdir($dir);
            $dir = dirname($dir);
        }
    }
}

function reset_fast_sql(): string
{
    $pdo = ps_pdo();
    $prefix = ps_db_prefix();
    $deleted = [];
    $updated = [];
    $skipped = [];
    $failed = [];

    $imageIds = [];
    if (reset_fast_table_exists($pdo, $prefix, 'image')) {
        $imageIds = array_map('intval', $pdo->query('SELECT id_image FROM `' . $prefix . 'image`')->fetchAll(PDO::FETCH_COLUMN));
    }

    $pdo->beginTransaction();
    try {
        $pdo->exec('SET FOREIGN_KEY_CHECKS = 0');

        foreach ([
            'order_invoice_payment',
            'order_detail_tax',
            'order_slip_detail',
            'order_slip',
            'order_payment',
            'order_history',
            'order_carrier',
            'order_cart_rule',
            'order_invoice_tax',
            'order_invoice',
            'order_detail',
            'orders',
            'cart_product',
            'cart_cart_rule',
            'cart_rule',
        ] as $table) {
            reset_fast_delete($pdo, $prefix, $table, $deleted, $skipped);
        }

        reset_fast_delete($pdo, $prefix, 'address', $deleted, $skipped, 'id_customer > 1 OR alias LIKE :alias', ['alias' => 'Adresse import%']);
        reset_fast_delete($pdo, $prefix, 'customer_group', $deleted, $skipped, 'id_customer > 1');
        reset_fast_delete($pdo, $prefix, 'customer', $deleted, $skipped, 'id_customer > 1');
        reset_fast_delete($pdo, $prefix, 'cart', $deleted, $skipped);

        foreach ([
            'specific_price',
            'specific_price_rule',
            'stock_available',
            'product_attribute_combination',
            'product_attribute_shop',
            'product_attribute_image',
            'product_attribute',
            'product_supplier',
            'category_product',
            'product_lang',
            'product_shop',
            'product',
            'image_lang',
            'image_shop',
            'image',
            'attribute_lang',
            'attribute_shop',
            'attribute',
            'attribute_group_lang',
            'attribute_group_shop',
            'attribute_group',
            'carrier_tax_rules_group_shop',
            'tax_rule',
            'tax_rules_group_shop',
            'tax_rules_group',
            'tax_lang',
            'tax',
            'category_group',
            'category_lang',
            'category_shop',
        ] as $table) {
            if (str_starts_with($table, 'category_') && $table !== 'category_product') {
                reset_fast_delete($pdo, $prefix, $table, $deleted, $skipped, 'id_category > 2');
            } else {
                reset_fast_delete($pdo, $prefix, $table, $deleted, $skipped);
            }
        }
        reset_fast_delete($pdo, $prefix, 'category', $deleted, $skipped, 'id_category > 2');

        foreach ([
            'orders' => 1,
            'cart' => 1,
            'address' => 1,
            'customer' => 2,
            'product' => 1,
            'product_attribute' => 1,
            'stock_available' => 1,
            'image' => 1,
            'attribute' => 1,
            'attribute_group' => 1,
            'tax' => 1,
            'tax_rule' => 1,
            'tax_rules_group' => 1,
            'category' => 3,
        ] as $table => $nextId) {
            reset_fast_auto_increment($pdo, $prefix, $table, $nextId, $skipped);
        }

        $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        $pdo->commit();
    } catch (Throwable $exception) {
        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS = 1');
        } catch (Throwable) {
        }
        $pdo->rollBack();
        throw $exception;
    }

    reset_fast_delete_image_files($imageIds, $deleted);

    $message = 'Reset SQL rapide termine: ' . array_sum($deleted) . ' element(s) supprime(s).';
    return reset_xml_response(true, $message, $deleted, $updated, $skipped, $failed);
}

try {
    try {
        echo reset_fast_sql();
        exit;
    } catch (Throwable $fastException) {
        // Fallback API XML si PDO/MySQL direct n'est pas disponible.
        $fastResetError = $fastException->getMessage();
    }

    $deleted = [];
    $updated = [];
    $skipped = isset($fastResetError) ? ['reset SQL rapide indisponible: ' . $fastResetError] : [];
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
        'order_slip',
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

    // Step 4: Reset stock_availables before combinations/products.
    // PrestaShop exposes this resource but does not allow DELETE on it.
    $stockIds = reset_list_ids_safe('stock_availables', $skipped);
    // ✅ Protéger les stocks des produits/combinations protégés
    if (!empty($protectedCustomerData['stock_availables'])) {
        $stockIds = array_values(array_diff($stockIds, $protectedCustomerData['stock_availables']));
    }
    reset_update_stock_quantities($stockIds, $updated, $failed);

    // Step 5: Delete combinations before products
    // ✅ Supprimer les combinations SANS passer par combinationIds (utiliser chaque product)
    try {
        $combinationIds = reset_list_ids_safe('combinations', $skipped);
        // ✅ Protéger les combinations des produits protégés
        if (!empty($protectedCustomerData['combinations'])) {
            $combinationIds = array_values(array_diff($combinationIds, $protectedCustomerData['combinations']));
        }
        
        // ✅ Essayer de supprimer par produit d'abord, puis par ID direct
        $productIds = reset_list_ids_safe('products', $skipped);
        if (!empty($protectedCustomerData['products'])) {
            $productIds = array_values(array_diff($productIds, $protectedCustomerData['products']));
        }
        
        foreach ($productIds as $productId) {
            try {
                $combosForProduct = ps_find_ids_by_field('combinations', 'id_product', $productId);
                foreach ($combosForProduct as $comboId) {
                    try {
                        ps_delete_resource('combinations', $comboId);
                        $deleted['combinations'] = ($deleted['combinations'] ?? 0) + 1;
                    } catch (Throwable $e) {
                        $failed[] = 'combinations/' . $comboId . ' (product ' . $productId . '): ' . $e->getMessage();
                    }
                }
            } catch (Throwable $e) {
                // Silently skip if finding combinations fails
            }
        }
        
        // Supprimer les combinations restantes par ID
        reset_delete_ids('combinations', array_values(array_diff($combinationIds, $productIds)), $deleted, $failed);
    } catch (Throwable $e) {
        $skipped[] = 'combinations: ' . $e->getMessage();
    }

    // Step 6: Delete products
    $ids = reset_list_ids_safe('products', $skipped);
    // ✅ Protéger les produits des commandes protégées
    if (!empty($protectedCustomerData['products'])) {
        $ids = array_values(array_diff($ids, $protectedCustomerData['products']));
    }
    reset_delete_ids('products', $ids, $deleted, $failed);

    // Step 7: Delete product options and values
    // ✅ Supprimer les option_values AVANT les options
    try {
        $optionValueIds = reset_list_ids_safe('product_option_values', $skipped);
        foreach ($optionValueIds as $valueId) {
            try {
                ps_delete_resource('product_option_values', $valueId);
                $deleted['product_option_values'] = ($deleted['product_option_values'] ?? 0) + 1;
            } catch (Throwable $e) {
                $failed[] = 'product_option_values/' . $valueId . ': ' . $e->getMessage();
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'product_option_values: ' . $e->getMessage();
    }

    try {
        $optionIds = reset_list_ids_safe('product_options', $skipped);
        foreach ($optionIds as $optionId) {
            try {
                ps_delete_resource('product_options', $optionId);
                $deleted['product_options'] = ($deleted['product_options'] ?? 0) + 1;
            } catch (Throwable $e) {
                $failed[] = 'product_options/' . $optionId . ': ' . $e->getMessage();
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'product_options: ' . $e->getMessage();
    }

    // Step 8: Delete tax-related data
    // ✅ Supprimer tax_rules AVANT tax_rule_groups (dépendance)
    try {
        $taxRuleIds = reset_list_ids_safe('tax_rules', $skipped);
        foreach ($taxRuleIds as $ruleId) {
            try {
                ps_delete_resource('tax_rules', $ruleId);
                $deleted['tax_rules'] = ($deleted['tax_rules'] ?? 0) + 1;
            } catch (Throwable $e) {
                $failed[] = 'tax_rules/' . $ruleId . ': ' . $e->getMessage();
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'tax_rules: ' . $e->getMessage();
    }

    try {
        $taxRuleGroupIds = reset_list_ids_safe('tax_rule_groups', $skipped);
        foreach ($taxRuleGroupIds as $groupId) {
            try {
                ps_delete_resource('tax_rule_groups', $groupId);
                $deleted['tax_rule_groups'] = ($deleted['tax_rule_groups'] ?? 0) + 1;
            } catch (Throwable $e) {
                $failed[] = 'tax_rule_groups/' . $groupId . ': ' . $e->getMessage();
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'tax_rule_groups: ' . $e->getMessage();
    }

    try {
        $taxIds = reset_list_ids_safe('taxes', $skipped);
        foreach ($taxIds as $taxId) {
            try {
                ps_delete_resource('taxes', $taxId);
                $deleted['taxes'] = ($deleted['taxes'] ?? 0) + 1;
            } catch (Throwable $e) {
                $failed[] = 'taxes/' . $taxId . ': ' . $e->getMessage();
            }
        }
    } catch (Throwable $e) {
        $skipped[] = 'taxes: ' . $e->getMessage();
    }

    // Step 9: Delete categories (except protected ones)
    reset_delete_ids('categories', reset_category_ids($protectedCategoryIds, $skipped), $deleted, $failed);

    foreach ($protectedCategoryIds as $id) {
        $skipped[] = 'category ' . $id . ' protected';
    }

    $deletedCount = array_sum($deleted);
    $updatedCount = array_sum($updated);
    $failedCount = count($failed);
    // Success = at least something was deleted (partial reset is acceptable)
    $success = $deletedCount > 0 || $updatedCount > 0 || $failedCount === 0;
    $message = $failedCount > 0
        ? 'Reset API XML termine: ' . $deletedCount . ' element(s) supprime(s), ' . $updatedCount . ' element(s) mis a jour, ' . $failedCount . ' echec(s) (certaines donnees protegees peuvent rester).'
        : 'Reset API XML termine: ' . $deletedCount . ' element(s) supprime(s), ' . $updatedCount . ' element(s) mis a jour. Categories 1 et 2, customer 1 et ses donnees liees sont conservees.';

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
    $xml .= '<prestashop success="' . ($success ? '1' : '0') . '" deletedCount="' . $deletedCount . '" updatedCount="' . $updatedCount . '" skippedCount="' . count($skipped) . '" failedCount="' . $failedCount . '">' . "\n";
    $xml .= '  <message>' . htmlspecialchars($message, ENT_XML1, 'UTF-8') . '</message>' . "\n";
    $xml .= '  <details>' . "\n";
    
    // Deleted items
    $xml .= '    <deleted>' . "\n";
    foreach ($deleted as $resource => $count) {
        $xml .= '      <item resource="' . htmlspecialchars($resource, ENT_XML1, 'UTF-8') . '">' . $count . '</item>' . "\n";
    }
    $xml .= '    </deleted>' . "\n";

    // Updated items
    $xml .= '    <updated>' . "\n";
    foreach ($updated as $resource => $count) {
        $xml .= '      <item resource="' . htmlspecialchars($resource, ENT_XML1, 'UTF-8') . '">' . $count . '</item>' . "\n";
    }
    $xml .= '    </updated>' . "\n";
    
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

