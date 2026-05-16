<?php

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    echo json_encode(['success' => false, 'message' => 'Method not allowed']);
    exit;
}

function clean_prefix(string $prefix): string
{
    return preg_replace('/[^a-zA-Z0-9_]/', '', $prefix) ?: 'ps_';
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
    $langId = (int) ($_GET['id_lang'] ?? 1);

    $dsn = 'mysql:host=' . $host . ($port !== '' ? ';port=' . $port : '') . ';dbname=' . $dbName . ';charset=utf8mb4';
    $pdo = new PDO($dsn, $dbUser, $dbPassword, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $categoryLang = '`' . $prefix . 'category_lang`';
    $category = '`' . $prefix . 'category`';
    $statement = $pdo->prepare(
        'SELECT cl.id_category AS id,
                cl.name,
                c.id_parent AS parent_id,
                c.active
         FROM ' . $categoryLang . ' cl
         LEFT JOIN ' . $category . ' c ON c.id_category = cl.id_category
         WHERE cl.id_lang = :id_lang
           AND cl.id_category NOT IN (1, 2)
         ORDER BY cl.name ASC, cl.id_category ASC'
    );
    $statement->execute(['id_lang' => $langId]);

    echo json_encode([
        'success' => true,
        'categories' => $statement->fetchAll(),
    ]);
} catch (Throwable $exception) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'message' => 'Chargement categories impossible: ' . $exception->getMessage(),
    ]);
}
