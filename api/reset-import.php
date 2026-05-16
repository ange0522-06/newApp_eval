<?php

declare(strict_types=1);

require_once __DIR__ . '/prestashop-webservice.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
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

    $deletePlan = [
        'order_histories',
        'order_payments',
        'order_details',
        'order_carriers',
        'order_cart_rules',
        'order_invoices',
        'order_slips',
        'orders',
        'cart_rules',
        'carts',
        'addresses',
        'customers',
        'stock_availables',
        'combinations',
        'products',
        'product_option_values',
        'product_options',
        'tax_rules',
        'tax_rule_groups',
        'taxes',
    ];

    foreach ($deletePlan as $resource) {
        $ids = reset_list_ids_safe($resource, $skipped);
        if (!empty($protectedCustomerData[$resource])) {
            $ids = array_values(array_diff($ids, $protectedCustomerData[$resource]));
        }

        reset_delete_ids($resource, $ids, $deleted, $failed);
    }

    reset_delete_ids('categories', reset_category_ids($protectedCategoryIds, $skipped), $deleted, $failed);

    foreach ($protectedCategoryIds as $id) {
        $skipped[] = 'category ' . $id . ' protected';
    }

    $deletedCount = array_sum($deleted);
    $failedCount = count($failed);
    $message = $failedCount > 0
        ? 'Reset API XML termine avec ' . $failedCount . ' echec(s).'
        : 'Reset API XML termine: ' . $deletedCount . ' element(s) supprime(s). Categories 1 et 2, customer 1 et ses donnees liees sont conservees.';

    echo json_encode([
        'success' => true,
        'message' => $message,
        'deletedCount' => $deletedCount,
        'skippedCount' => count($skipped),
        'failedCount' => $failedCount,
        'details' => [
            'deleted' => $deleted,
            'skipped' => $skipped,
            'failed' => $failed,
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur reset API XML: ' . $exception->getMessage(),
    ]);
}

