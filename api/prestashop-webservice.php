<?php

declare(strict_types=1);

final class PrestaShopWebserviceException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $statusCode = 0,
        public readonly string $responseBody = ''
    ) {
        parent::__construct($message, $statusCode);
    }
}

function ps_read_env_file(string $path): array
{
    if (!is_file($path) || !is_readable($path)) {
        return [];
    }

    $values = [];
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }

        [$key, $value] = explode('=', $line, 2);
        $values[trim($key)] = trim(trim($value), "\"'");
    }

    return $values;
}

function ps_env_value(string $key, ?string $fallback = null): ?string
{
    $value = getenv($key);
    if ($value !== false && $value !== '') {
        return $value;
    }

    static $env = null;
    if ($env === null) {
        $env = ps_read_env_file(__DIR__ . '/../.env');
    }

    return $env[$key] ?? $fallback;
}

function ps_api_key(): string
{
    $key = ps_env_value('PS_API_KEY') ?: ps_env_value('VITE_PS_API_KEY');
    if (!$key) {
        throw new PrestaShopWebserviceException('Cle API PrestaShop introuvable.');
    }

    return $key;
}

function ps_api_base_url(): string
{
    $base = ps_env_value('PS_API_BASE_URL');
    if (!$base) {
        $shopBase = ps_env_value('VITE_API_URL_BACKEND', 'http://localhost/e-commerce/eval');
        $base = rtrim((string) $shopBase, '/') . '/api';
    }

    return rtrim($base, '/');
}

function ps_build_url(string $path, array $query = []): string
{
    $query['ws_key'] = ps_api_key();
    $separator = str_contains($path, '?') ? '&' : '?';

    return ps_api_base_url()
        . '/'
        . ltrim($path, '/')
        . $separator
        . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
}

function ps_parse_error_message(string $body): string
{
    if ($body === '') {
        return '';
    }

    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($body, SimpleXMLElement::class, LIBXML_NOCDATA);
    libxml_clear_errors();

    if (!$xml instanceof SimpleXMLElement) {
        return trim(strip_tags($body));
    }

    $messages = $xml->xpath('//error/message') ?: $xml->xpath('//message') ?: [];
    foreach ($messages as $message) {
        $text = trim((string) $message);
        if ($text !== '') {
            return $text;
        }
    }

    return '';
}

function ps_ws_request(string $method, string $path, array $query = [], ?string $body = null): array
{
    if (!function_exists('curl_init')) {
        throw new PrestaShopWebserviceException('Extension PHP cURL requise pour appeler le Webservice PrestaShop.');
    }

    $ch = curl_init(ps_build_url($path, $query));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => [
            'Accept: text/xml',
            'Content-Type: text/xml; charset=utf-8',
        ],
    ]);

    if ($body !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    }

    $responseBody = curl_exec($ch);
    $curlError = curl_error($ch);
    $statusCode = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($responseBody === false) {
        throw new PrestaShopWebserviceException('Appel Webservice impossible: ' . $curlError);
    }

    $responseBody = (string) $responseBody;
    if ($statusCode >= 400) {
        $message = ps_parse_error_message($responseBody) ?: ('HTTP ' . $statusCode);
        throw new PrestaShopWebserviceException($message, $statusCode, $responseBody);
    }

    return ['status' => $statusCode, 'body' => $responseBody];
}

function ps_ws_xml(string $method, string $path, array $query = [], ?string $body = null): SimpleXMLElement
{
    $response = ps_ws_request($method, $path, $query, $body);

    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($response['body'], SimpleXMLElement::class, LIBXML_NOCDATA);
    $errors = libxml_get_errors();
    libxml_clear_errors();

    if (!$xml instanceof SimpleXMLElement) {
        $message = $errors ? trim($errors[0]->message) : 'XML PrestaShop invalide.';
        throw new PrestaShopWebserviceException($message);
    }

    return $xml;
}

function ps_filter_value(string|int|float $value): string
{
    return '[' . (string) $value . ']';
}

function ps_singular_resource(string $resource): string
{
    if (str_ends_with($resource, 'ies')) {
        return substr($resource, 0, -3) . 'y';
    }

    if (str_ends_with($resource, 's')) {
        return substr($resource, 0, -1);
    }

    return $resource;
}

function ps_extract_ids(SimpleXMLElement $xml, string $resource): array
{
    $container = $xml->{$resource};
    if (!$container instanceof SimpleXMLElement) {
        return [];
    }

    $ids = [];
    foreach ($container->children() as $node) {
        $id = (string) ($node['id'] ?? '');
        if ($id === '' && isset($node->id)) {
            $id = (string) $node->id;
        }
        if ((int) $id > 0) {
            $ids[] = (int) $id;
        }
    }

    return array_values(array_unique($ids));
}

function ps_list_ids(string $resource, array $query = []): array
{
    $query = ['display' => '[id]'] + $query;

    return ps_extract_ids(ps_ws_xml('GET', $resource, $query), $resource);
}

function ps_find_ids_by_field(string $resource, string $field, string|int|float $value, string $display = '[id]'): array
{
    return ps_list_ids($resource, [
        'display' => $display,
        'filter[' . $field . ']' => ps_filter_value($value),
    ]);
}

function ps_list_full_nodes(string $resource, array $query = []): array
{
    $xml = ps_ws_xml('GET', $resource, ['display' => 'full'] + $query);
    $container = $xml->{$resource};
    if (!$container instanceof SimpleXMLElement) {
        return [];
    }

    $nodes = [];
    foreach ($container->children() as $node) {
        $nodes[] = $node;
    }

    return $nodes;
}

function ps_text(SimpleXMLElement $node, string $field): string
{
    return trim((string) ($node->{$field} ?? ''));
}

function ps_lang_text(SimpleXMLElement $node, string $field, int $langId): string
{
    if (!isset($node->{$field}->language)) {
        return ps_text($node, $field);
    }

    $fallback = '';
    foreach ($node->{$field}->language as $language) {
        $text = trim((string) $language);
        if ($fallback === '' && $text !== '') {
            $fallback = $text;
        }
        if ((int) ($language['id'] ?? 0) === $langId) {
            return $text;
        }
    }

    return $fallback;
}

function ps_get_resource_xml(string $resource, int $id): string
{
    return ps_ws_request('GET', $resource . '/' . $id)['body'];
}

function ps_load_dom(string $xml): DOMDocument
{
    $doc = new DOMDocument('1.0', 'UTF-8');
    $doc->preserveWhiteSpace = false;
    $doc->formatOutput = true;

    libxml_use_internal_errors(true);
    $loaded = $doc->loadXML($xml);
    $errors = libxml_get_errors();
    libxml_clear_errors();

    if (!$loaded) {
        $message = $errors ? trim($errors[0]->message) : 'XML PrestaShop invalide.';
        throw new PrestaShopWebserviceException($message);
    }

    return $doc;
}

function ps_resource_element(DOMDocument $doc, string $resource): DOMElement
{
    $singular = ps_singular_resource($resource);
    $elements = $doc->getElementsByTagName($singular);
    if ($elements->length > 0 && $elements->item(0) instanceof DOMElement) {
        return $elements->item(0);
    }

    $root = $doc->documentElement;
    if ($root instanceof DOMElement) {
        foreach ($root->childNodes as $child) {
            if ($child instanceof DOMElement) {
                return $child;
            }
        }
    }

    throw new PrestaShopWebserviceException('Element XML introuvable pour ' . $resource . '.');
}

function ps_direct_child(DOMElement $element, string $tagName): ?DOMElement
{
    foreach ($element->childNodes as $child) {
        if ($child instanceof DOMElement && $child->tagName === $tagName) {
            return $child;
        }
    }

    return null;
}

function ps_set_dom_text(DOMElement $element, string $tagName, string|int|float $value): void
{
    $child = ps_direct_child($element, $tagName);
    if (!$child instanceof DOMElement) {
        return;
    }

    while ($child->firstChild) {
        $child->removeChild($child->firstChild);
    }
    $child->appendChild($element->ownerDocument->createTextNode((string) $value));
}

function ps_remove_dom_child(DOMElement $element, string $tagName): void
{
    foreach (iterator_to_array($element->childNodes) as $child) {
        if ($child instanceof DOMElement && $child->tagName === $tagName) {
            $element->removeChild($child);
        }
    }
}

function ps_put_resource_xml(string $resource, int $id, string $xml): void
{
    ps_ws_request('PUT', $resource . '/' . $id, [], $xml);
}

function ps_update_resource_fields(string $resource, int $id, array $fields): void
{
    $doc = ps_load_dom(ps_get_resource_xml($resource, $id));
    $element = ps_resource_element($doc, $resource);

    // PrestaShop refuse certains champs en lecture seule au moment du PUT.
    // On retire les horodatages système pour que la mise à jour reste valide.
    ps_remove_dom_child($element, 'date_add');
    ps_remove_dom_child($element, 'date_upd');

    foreach ($fields as $name => $value) {
        ps_set_dom_text($element, (string) $name, $value);
    }

    ps_put_resource_xml($resource, $id, $doc->saveXML());
}

function ps_delete_resource(string $resource, int $id): void
{
    ps_ws_request('DELETE', $resource . '/' . $id);
}

