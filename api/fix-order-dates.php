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

function fix_order_date_is_valid(string $date): bool
{
    if (!preg_match('/^\d{4}-\d{2}-\d{2} 00:00:00$/', $date)) {
        return false;
    }

    [$ymd] = explode(' ', $date, 2);
    [$year, $month, $day] = array_map('intval', explode('-', $ymd));
    return checkdate($month, $day, $year);
}

function fix_order_patch_resource_fields(string $resource, int $id, array $fields): void
{
    $singular = ps_singular_resource($resource);
    $doc = new DOMDocument('1.0', 'UTF-8');
    $doc->formatOutput = true;

    $root = $doc->createElement('prestashop');
    $doc->appendChild($root);
    $node = $doc->createElement($singular);
    $root->appendChild($node);

    $idNode = $doc->createElement('id');
    $idNode->appendChild($doc->createTextNode((string) $id));
    $node->appendChild($idNode);

    foreach ($fields as $name => $value) {
        $fieldNode = $doc->createElement((string) $name);
        $fieldNode->appendChild($doc->createTextNode((string) $value));
        $node->appendChild($fieldNode);
    }

    ps_patch_resource_xml($resource, $id, $doc->saveXML());
}

function fix_order_get_node(int $orderId): SimpleXMLElement
{
    $xml = ps_ws_xml('GET', 'orders/' . $orderId);
    if (!isset($xml->order)) {
        throw new RuntimeException('Commande introuvable: ' . $orderId);
    }

    return $xml->order;
}

function fix_order_patch_many(string $resource, array $ids, array $fields, array &$updated): void
{
    foreach (array_values(array_unique(array_map('intval', $ids))) as $id) {
        if ($id <= 0) {
            continue;
        }

        fix_order_patch_resource_fields($resource, $id, $fields);
        $updated[] = $resource . '/' . $id;
    }
}

try {
    $payload = json_decode(file_get_contents('php://input') ?: '', true, 512, JSON_THROW_ON_ERROR);
    $orders = is_array($payload['orders'] ?? null) ? $payload['orders'] : [];
    if (!$orders) {
        throw new InvalidArgumentException('Aucune commande a corriger.');
    }

    $fixed = 0;
    $failed = 0;
    $errors = [];
    $details = [];

    foreach ($orders as $entry) {
        $orderId = (int) ($entry['id'] ?? 0);
        $date = (string) ($entry['date'] ?? '');

        if ($orderId <= 0 || !fix_order_date_is_valid($date)) {
            $failed++;
            $errors[] = 'Commande invalide: ' . json_encode($entry);
            continue;
        }

        $updated = [];

        try {
            $order = fix_order_get_node($orderId);

            fix_order_patch_resource_fields('orders', $orderId, [
                'date_add' => $date,
                'date_upd' => $date,
            ]);
            $updated[] = 'orders/' . $orderId;

            fix_order_patch_many(
                'order_histories',
                ps_find_ids_by_field('order_histories', 'id_order', $orderId),
                ['date_add' => $date],
                $updated
            );

            $cartId = (int) ps_text($order, 'id_cart');
            if ($cartId > 0) {
                fix_order_patch_resource_fields('carts', $cartId, [
                    'date_add' => $date,
                    'date_upd' => $date,
                ]);
                $updated[] = 'carts/' . $cartId;
            }

            fix_order_patch_many(
                'addresses',
                [
                    (int) ps_text($order, 'id_address_delivery'),
                    (int) ps_text($order, 'id_address_invoice'),
                ],
                [
                    'date_add' => $date,
                    'date_upd' => $date,
                ],
                $updated
            );

            $reference = ps_text($order, 'reference');
            if ($reference !== '') {
                fix_order_patch_many(
                    'order_payments',
                    ps_find_ids_by_field('order_payments', 'order_reference', $reference),
                    ['date_add' => $date],
                    $updated
                );
            }

            $fixed++;
            $details[] = [
                'order' => $orderId,
                'updated' => $updated,
            ];
        } catch (Throwable $exception) {
            $failed++;
            $errors[] = 'Commande ' . $orderId . ': ' . $exception->getMessage();
            continue;
        }
    }

    echo json_encode([
        'success' => $failed === 0,
        'fixed' => $fixed,
        'failed' => $failed,
        'errors' => $errors,
        'details' => $details,
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'fixed' => 0,
        'failed' => 1,
        'errors' => [$exception->getMessage()],
    ]);
}
