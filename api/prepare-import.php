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

function clean_prefix(string $prefix): string
{
    return preg_replace('/[^a-zA-Z0-9_]/', '', $prefix) ?: 'ps_';
}

function table_name(string $prefix, string $table): string
{
    return '`' . $prefix . $table . '`';
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

    $configuration = table_name($prefix, 'configuration');
    $statement = $pdo->prepare(
        'UPDATE ' . $configuration . '
         SET value = :value, date_upd = NOW()
         WHERE name IN (:ssl_enabled, :ssl_everywhere)'
    );
    $statement->execute([
        'value' => '0',
        'ssl_enabled' => 'PS_SSL_ENABLED',
        'ssl_everywhere' => 'PS_SSL_ENABLED_EVERYWHERE',
    ]);

    $shopUrl = table_name($prefix, 'shop_url');
    $pdo->exec(
        'UPDATE ' . $shopUrl . "
         SET domain = 'localhost',
             domain_ssl = 'localhost',
             physical_uri = '/e-commerce/eval/',
             virtual_uri = '',
             main = 1,
             active = 1
         WHERE id_shop = 1"
    );

    echo json_encode([
        'success' => true,
        'message' => 'Configuration locale PrestaShop preparee pour import HTTP.',
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Preparation import impossible: ' . $exception->getMessage(),
    ]);
}
