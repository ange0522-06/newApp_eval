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

function prepare_update_configuration(string $name, string $value, array &$updated, array &$skipped): void
{
    try {
        $ids = ps_find_ids_by_field('configurations', 'name', $name);
        if (!$ids) {
            $skipped[] = 'configuration ' . $name . ' introuvable';
            return;
        }

        foreach ($ids as $id) {
            try {
                ps_update_resource_fields('configurations', $id, ['value' => $value]);
                $updated[] = 'configuration ' . $name;
            } catch (Throwable $exception) {
                $skipped[] = 'configuration ' . $name . ' / ' . $id . ' impossible: ' . $exception->getMessage();
            }
        }
    } catch (Throwable $exception) {
        $skipped[] = 'configuration ' . $name . ' impossible: ' . $exception->getMessage();
    }
}

try {
    $updated = [];
    $skipped = [];

    prepare_update_configuration('PS_SSL_ENABLED', '0', $updated, $skipped);
    prepare_update_configuration('PS_SSL_ENABLED_EVERYWHERE', '0', $updated, $skipped);

    try {
        $shopUrlIds = ps_find_ids_by_field('shop_urls', 'id_shop', 1);
        if (!$shopUrlIds) {
            $skipped[] = 'shop_url id_shop=1 introuvable';
        }

        foreach ($shopUrlIds as $id) {
            try {
                ps_update_resource_fields('shop_urls', $id, [
                    'domain' => 'localhost',
                    'domain_ssl' => 'localhost',
                    'physical_uri' => '/e-commerce/eval/',
                    'virtual_uri' => '',
                    'main' => '1',
                    'active' => '1',
                ]);
                $updated[] = 'shop_urls ' . $id;
            } catch (Throwable $exception) {
                $skipped[] = 'shop_url ' . $id . ' impossible: ' . $exception->getMessage();
            }
        }
    } catch (Throwable $exception) {
        $skipped[] = 'shop_urls impossible: ' . $exception->getMessage();
    }

    $message = 'Configuration locale PrestaShop preparee via API XML.';
    if (!empty($skipped)) {
        $message .= ' Certaines modifications ont ete ignorees.';
    }

    echo json_encode([
        'success' => true,
        'message' => $message,
        'details' => [
            'updated' => $updated,
            'skipped' => $skipped,
        ],
    ]);
} catch (Throwable $exception) {
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Configuration locale PrestaShop preparee avec avertissements.',
        'details' => [
            'updated' => $updated ?? [],
            'skipped' => array_merge($skipped ?? [], ['preparation globale impossible: ' . $exception->getMessage()]),
        ],
    ]);
}

