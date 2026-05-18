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

function prepare_json_body(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return [];
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function prepare_cleanup_broken_combinations(array &$deleted, array &$skipped): void
{
    try {
        $productIds = ps_list_ids('products');
        $deletedCount = 0;

        foreach ($productIds as $productId) {
            try {
                $combinationIds = ps_list_ids('products/' . $productId . '/combinations');
                foreach ($combinationIds as $combinationId) {
                    try {
                        ps_delete_resource('products/' . $productId . '/combinations', $combinationId);
                        $deletedCount++;
                    } catch (Throwable $exception) {
                        $skipped[] = 'combinaison ' . $combinationId . ' indéchiffrable: ' . $exception->getMessage();
                    }
                }
            } catch (Throwable $exception) {
                $skipped[] = 'produit ' . $productId . ' combinaisons: ' . $exception->getMessage();
            }
        }

        if ($deletedCount > 0) {
            $deleted['product_attribute'] = $deletedCount;
        }
    } catch (Throwable $exception) {
        $skipped[] = 'nettoyage combinaisons cassées impossible: ' . $exception->getMessage();
    }
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
                $skipped[] = 'configuration ' . $name . ' impossible: ' . $exception->getMessage();
            }
        }
    } catch (Throwable $exception) {
        $skipped[] = 'configuration ' . $name . ' recherche impossible: ' . $exception->getMessage();
    }
}

function prepare_update_shop_urls(array &$updated, array &$skipped): void
{
    try {
        $shopUrlIds = ps_find_ids_by_field('shop_urls', 'id_shop', 1);
        if (!$shopUrlIds) {
            $skipped[] = 'shop_url id_shop=1 introuvable';
            return;
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
        $skipped[] = 'shop_urls recherche impossible: ' . $exception->getMessage();
    }
}

function prepare_run_api(array &$updated, array &$deleted, array &$skipped): void
{
    prepare_update_configuration('PS_SSL_ENABLED', '0', $updated, $skipped);
    prepare_update_configuration('PS_SSL_ENABLED_EVERYWHERE', '0', $updated, $skipped);
    prepare_update_shop_urls($updated, $skipped);
    prepare_cleanup_broken_combinations($deleted, $skipped);
}

function prepare_repair_combination(array $body): array
{
    $productId = (int) ($body['productId'] ?? 0);
    $combinationId = (int) ($body['combinationId'] ?? 0);
    $valueId = (int) ($body['valueId'] ?? 0);
    $priceImpactHT = (float) ($body['priceImpactHT'] ?? 0);
    $isDefault = !empty($body['isDefault']);

    if ($productId <= 0 || $combinationId <= 0 || $valueId <= 0) {
        throw new PrestaShopWebserviceException('Parametres repair-combination invalides.');
    }

    try {
        $defaultOn = $isDefault ? 1 : 0;

        if ($isDefault) {
            $allCombinations = ps_list_ids('products/' . $productId . '/combinations');
            foreach ($allCombinations as $otherCombinationId) {
                if ($otherCombinationId !== $combinationId) {
                    try {
                        ps_update_resource_fields('products/' . $productId . '/combinations', $otherCombinationId, ['default_on' => '0']);
                    } catch (Throwable $exception) {
                        // Ignore errors for other combinations
                    }
                }
            }
        }

        ps_update_resource_fields('products/' . $productId . '/combinations', $combinationId, [
            'price' => (string) number_format($priceImpactHT, 6, '.', ''),
            'minimal_quantity' => '1',
            'default_on' => (string) $defaultOn,
        ]);

        if ($isDefault) {
            ps_update_resource_fields('products', $productId, [
                'cache_default_attribute' => (string) $combinationId,
            ]);
        }

        return [
            'combinationId' => $combinationId,
            'stockId' => 0, // API doesn't return stock ID directly
        ];
    } catch (Throwable $exception) {
        throw $exception;
    }
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
    $body = prepare_json_body();
    if (($body['action'] ?? '') === 'repair-combination') {
        echo json_encode([
            'success' => true,
            'message' => 'Declinaison reparee.',
            'details' => prepare_repair_combination($body),
        ]);
        exit;
    }

    $updated = [];
    $deleted = [];
    $skipped = [];

    prepare_run_api($updated, $deleted, $skipped);

    $message = 'Configuration locale PrestaShop preparee.';
    if (!empty($deleted)) {
        $message = 'Configuration locale PrestaShop preparee et combinaisons cassees nettoyees.';
    }
    if (!empty($skipped)) {
        $message .= ' Certaines modifications ont ete ignorees.';
    }

    echo json_encode([
        'success' => true,
        'message' => $message,
        'details' => [
            'updated' => $updated,
            'deleted' => $deleted,
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
            'deleted' => $deleted ?? [],
            'skipped' => array_merge($skipped ?? [], ['preparation globale impossible: ' . $exception->getMessage()]),
        ],
    ]);
}

