<?php

declare(strict_types=1);

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

$productReferences = ['T_01', 'P_01', 'C_03', 'M_02'];
$customerEmails = ['rakoto@yopmail.com', 'rajao1970@yopmail.com'];
$categoryNames = ['Akanjo', 'Accessoire', 'Vetements', 'Vêtements', 'Accessoires'];
$attributeGroups = ['taille', 'couleur'];
$attributeValues = ['ngoza', 'kely', 'mainty', 'fotsy'];
$protectedCategoryIds = [1, 2];

function clean_prefix(string $prefix): string
{
    return preg_replace('/[^a-zA-Z0-9_]/', '', $prefix) ?: 'ps_';
}

function placeholders(array $values): string
{
    return implode(',', array_fill(0, count($values), '?'));
}

function table_name(string $prefix, string $table): string
{
    return '`' . $prefix . $table . '`';
}

function table_exists(PDO $pdo, string $prefix, string $table): bool
{
    $statement = $pdo->prepare('SHOW TABLES LIKE ?');
    $statement->execute([$prefix . $table]);
    return (bool) $statement->fetchColumn();
}

function column_exists(PDO $pdo, string $prefix, string $table, string $column): bool
{
    if (!table_exists($pdo, $prefix, $table)) {
        return false;
    }

    $statement = $pdo->prepare('SHOW COLUMNS FROM ' . table_name($prefix, $table) . ' LIKE ?');
    $statement->execute([$column]);
    return (bool) $statement->fetchColumn();
}

function fetch_ids(PDO $pdo, string $sql, array $params = []): array
{
    if (str_contains($sql, 'IN ()')) {
        return [];
    }

    $statement = $pdo->prepare($sql);
    $statement->execute($params);
    return array_values(array_unique(array_map('intval', $statement->fetchAll(PDO::FETCH_COLUMN))));
}

function delete_where(PDO $pdo, string $prefix, string $table, string $where, array $params, array &$deleted): int
{
    if (!table_exists($pdo, $prefix, $table)) {
        return 0;
    }

    if (str_contains($where, 'IN ()')) {
        return 0;
    }

    $statement = $pdo->prepare('DELETE FROM ' . table_name($prefix, $table) . ' WHERE ' . $where);
    $statement->execute($params);
    $count = $statement->rowCount();
    if ($count > 0) {
        $deleted[$table] = ($deleted[$table] ?? 0) + $count;
    }
    return $count;
}

function delete_in(PDO $pdo, string $prefix, string $table, string $column, array $ids, array &$deleted): int
{
    $ids = array_values(array_unique(array_map('intval', array_filter($ids, static fn ($id) => (int) $id > 0))));
    if (!$ids) {
        return 0;
    }

    if (!column_exists($pdo, $prefix, $table, $column)) {
        return 0;
    }

    return delete_where($pdo, $prefix, $table, '`' . $column . '` IN (' . placeholders($ids) . ')', $ids, $deleted);
}

function delete_all(PDO $pdo, string $prefix, string $table, array &$deleted): int
{
    return delete_where($pdo, $prefix, $table, '1=1', [], $deleted);
}

function add_ids(array &$target, array $ids): void
{
    $target = array_values(array_unique(array_merge($target, array_map('intval', $ids))));
}

function image_path(int $imageId): string
{
    return implode(DIRECTORY_SEPARATOR, str_split((string) $imageId));
}

function delete_product_image_files(string $shopRoot, array $imageIds): int
{
    $deleted = 0;
    foreach ($imageIds as $imageId) {
        $id = (int) $imageId;
        if ($id <= 0) {
            continue;
        }

        $directory = $shopRoot . DIRECTORY_SEPARATOR . 'img' . DIRECTORY_SEPARATOR . 'p' . DIRECTORY_SEPARATOR . image_path($id);
        foreach (glob($directory . DIRECTORY_SEPARATOR . $id . '*') ?: [] as $file) {
            if (is_file($file) && @unlink($file)) {
                $deleted++;
            }
        }

        if (is_dir($directory)) {
            @rmdir($directory);
        }
    }
    return $deleted;
}

try {
    $config = require __DIR__ . '/../../eval/app/config/parameters.php';
    $params = $config['parameters'] ?? [];

    $host = (string) ($params['database_host'] ?? '127.0.0.1');
    $port = (string) ($params['database_port'] ?? '');
    $dbName = (string) ($params['database_name'] ?? '');
    $dbUser = (string) ($params['database_user'] ?? '');
    $dbPassword = (string) ($params['database_password'] ?? '');
    $prefix = clean_prefix((string) ($params['database_prefix'] ?? 'ps_'));

    $dsn = 'mysql:host=' . $host . ($port !== '' ? ';port=' . $port : '') . ';dbname=' . $dbName . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $deleted = [];
    $skipped = [];
    $shopRoot = realpath(__DIR__ . '/../../eval') ?: (__DIR__ . '/../../eval');

    $productIds = table_exists($pdo, $prefix, 'product')
        ? fetch_ids($pdo, 'SELECT id_product FROM ' . table_name($prefix, 'product') . ' WHERE id_product > 0')
        : [];

    $customerIds = table_exists($pdo, $prefix, 'customer')
        ? fetch_ids($pdo, 'SELECT id_customer FROM ' . table_name($prefix, 'customer') . ' WHERE id_customer > 0')
        : [];

    $categoryIds = table_exists($pdo, $prefix, 'category')
        ? fetch_ids(
            $pdo,
            'SELECT id_category FROM ' . table_name($prefix, 'category') . '
             WHERE id_category NOT IN (' . placeholders($protectedCategoryIds) . ')',
            $protectedCategoryIds
        )
        : [];

    $attributeGroupIds = table_exists($pdo, $prefix, 'attribute_group')
        ? fetch_ids($pdo, 'SELECT id_attribute_group FROM ' . table_name($prefix, 'attribute_group') . ' WHERE id_attribute_group > 0')
        : [];

    $attributeValueIds = table_exists($pdo, $prefix, 'attribute')
        ? fetch_ids($pdo, 'SELECT id_attribute FROM ' . table_name($prefix, 'attribute') . ' WHERE id_attribute > 0')
        : [];

    $productAttributeIds = table_exists($pdo, $prefix, 'product_attribute')
        ? fetch_ids($pdo, 'SELECT id_product_attribute FROM ' . table_name($prefix, 'product_attribute') . ' WHERE id_product_attribute > 0')
        : [];

    $cartIds = table_exists($pdo, $prefix, 'cart')
        ? fetch_ids($pdo, 'SELECT id_cart FROM ' . table_name($prefix, 'cart') . ' WHERE id_cart > 0')
        : [];

    $orderIds = table_exists($pdo, $prefix, 'orders')
        ? fetch_ids($pdo, 'SELECT id_order FROM ' . table_name($prefix, 'orders') . ' WHERE id_order > 0')
        : [];

    $orderDetailIds = $orderIds && table_exists($pdo, $prefix, 'order_detail')
        ? fetch_ids($pdo, 'SELECT id_order_detail FROM ' . table_name($prefix, 'order_detail') . ' WHERE id_order IN (' . placeholders($orderIds) . ')', $orderIds)
        : [];

    $orderInvoiceIds = $orderIds && table_exists($pdo, $prefix, 'order_invoice')
        ? fetch_ids($pdo, 'SELECT id_order_invoice FROM ' . table_name($prefix, 'order_invoice') . ' WHERE id_order IN (' . placeholders($orderIds) . ')', $orderIds)
        : [];

    $orderReferences = [];
    if ($orderIds && table_exists($pdo, $prefix, 'orders')) {
        $statement = $pdo->prepare('SELECT DISTINCT reference FROM ' . table_name($prefix, 'orders') . ' WHERE id_order IN (' . placeholders($orderIds) . ')');
        $statement->execute($orderIds);
        $orderReferences = array_values(array_filter($statement->fetchAll(PDO::FETCH_COLUMN)));
    }

    $addressIds = [];
    if ($customerIds && table_exists($pdo, $prefix, 'address')) {
        $addressIds = fetch_ids(
            $pdo,
            'SELECT id_address FROM ' . table_name($prefix, 'address') . ' WHERE id_customer IN (' . placeholders($customerIds) . ')',
            $customerIds
        );
    }
    if ($orderIds && table_exists($pdo, $prefix, 'orders')) {
        add_ids(
            $addressIds,
            fetch_ids(
                $pdo,
                'SELECT id_address_delivery FROM ' . table_name($prefix, 'orders') . ' WHERE id_order IN (' . placeholders($orderIds) . ')
                 UNION
                 SELECT id_address_invoice FROM ' . table_name($prefix, 'orders') . ' WHERE id_order IN (' . placeholders($orderIds) . ')',
                array_merge($orderIds, $orderIds)
            )
        );
    }

    $imageIds = table_exists($pdo, $prefix, 'image')
        ? fetch_ids($pdo, 'SELECT id_image FROM ' . table_name($prefix, 'image') . ' WHERE id_image > 0')
        : [];

    $taxRuleGroupIds = table_exists($pdo, $prefix, 'tax_rules_group')
        ? fetch_ids($pdo, 'SELECT id_tax_rules_group FROM ' . table_name($prefix, 'tax_rules_group') . ' WHERE id_tax_rules_group > 0')
        : [];
    $taxIds = $taxRuleGroupIds && table_exists($pdo, $prefix, 'tax_rule')
        ? fetch_ids($pdo, 'SELECT DISTINCT id_tax FROM ' . table_name($prefix, 'tax_rule') . ' WHERE id_tax_rules_group IN (' . placeholders($taxRuleGroupIds) . ')', $taxRuleGroupIds)
        : [];

    $pdo->beginTransaction();
    $pdo->exec('SET FOREIGN_KEY_CHECKS=0');

    foreach ([
        'order_return_detail',
        'order_return',
        'order_slip_detail',
        'order_slip',
        'order_history',
        'order_detail_tax',
        'order_detail',
        'order_invoice_tax',
        'order_invoice_payment',
        'order_invoice',
        'order_carrier',
        'order_cart_rule',
        'order_payment',
        'orders',
        'cart_product',
        'cart_cart_rule',
        'cart',
        'address',
        'customer_group',
        'customer_message',
        'customer_thread',
        'customer_session',
        'customer',
        'stock_available',
        'product_attribute_combination',
        'product_attribute_image',
        'product_attribute_lang',
        'product_attribute_shop',
        'product_attribute',
        'image_lang',
        'image_shop',
        'image',
        'category_product',
        'product_attachment',
        'product_carrier',
        'product_country_tax',
        'product_download',
        'product_group_reduction_cache',
        'product_lang',
        'product_sale',
        'product_shop',
        'product_supplier',
        'product_tag',
        'feature_product',
        'specific_price',
        'specific_price_priority',
        'tag_count',
        'pack',
        'customization_field_lang',
        'customization_field',
        'customized_data',
        'customization',
        'product',
        'attribute_lang',
        'attribute_shop',
        'attribute',
        'attribute_group_lang',
        'attribute_group_shop',
        'attribute_group',
        'tax_rule',
        'tax_rules_group_shop',
        'tax_rules_group',
    ] as $table) {
        delete_all($pdo, $prefix, $table, $deleted);
    }

    if ($taxIds) {
        $taxesStillUsed = table_exists($pdo, $prefix, 'tax_rule')
            ? fetch_ids($pdo, 'SELECT DISTINCT id_tax FROM ' . table_name($prefix, 'tax_rule') . ' WHERE id_tax IN (' . placeholders($taxIds) . ')', $taxIds)
            : [];
        $taxIdsToDelete = array_values(array_diff($taxIds, $taxesStillUsed));
        delete_in($pdo, $prefix, 'tax_lang', 'id_tax', $taxIdsToDelete, $deleted);
        delete_in($pdo, $prefix, 'tax', 'id_tax', $taxIdsToDelete, $deleted);
    }

    $categoryWhere = '`id_category` NOT IN (' . placeholders($protectedCategoryIds) . ')';
    delete_where($pdo, $prefix, 'category_group', $categoryWhere, $protectedCategoryIds, $deleted);
    delete_where($pdo, $prefix, 'category_lang', $categoryWhere, $protectedCategoryIds, $deleted);
    delete_where($pdo, $prefix, 'category_shop', $categoryWhere, $protectedCategoryIds, $deleted);
    delete_where($pdo, $prefix, 'category', $categoryWhere, $protectedCategoryIds, $deleted);

    if (table_exists($pdo, $prefix, 'category')) {
        $statement = $pdo->prepare(
            'UPDATE ' . table_name($prefix, 'category') . '
             SET id_parent = CASE WHEN id_category = 1 THEN 0 ELSE 1 END,
                 level_depth = CASE WHEN id_category = 1 THEN 0 ELSE 1 END,
                 nleft = CASE WHEN id_category = 1 THEN 1 ELSE 2 END,
                 nright = CASE WHEN id_category = 1 THEN 4 ELSE 3 END,
                 position = 0
             WHERE id_category IN (' . placeholders($protectedCategoryIds) . ')'
        );
        $statement->execute($protectedCategoryIds);
    }

    $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
    $pdo->commit();

    $deletedImageFiles = delete_product_image_files($shopRoot, $imageIds);
    if ($deletedImageFiles > 0) {
        $deleted['image_files'] = $deletedImageFiles;
    }

    foreach ($protectedCategoryIds as $id) {
        $skipped[] = 'category ' . $id . ' protected';
    }

    $deletedCount = array_sum($deleted);
    echo json_encode([
        'success' => true,
        'message' => 'Reset termine: ' . $deletedCount . ' element(s) supprime(s). Categories 1 et 2 conservees.',
        'deletedCount' => $deletedCount,
        'skippedCount' => count($skipped),
        'failedCount' => 0,
        'details' => [
            'deleted' => $deleted,
            'skipped' => $skipped,
        ],
    ]);
} catch (Throwable $exception) {
    if (isset($pdo) && $pdo instanceof PDO && $pdo->inTransaction()) {
        try {
            $pdo->exec('SET FOREIGN_KEY_CHECKS=1');
            $pdo->rollBack();
        } catch (Throwable) {
        }
    }

    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Erreur reset: ' . $exception->getMessage(),
    ]);
}
