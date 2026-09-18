<?php
declare(strict_types=1);

ini_set('display_errors', '0');
ini_set('default_mimetype', '');
header_remove('X-Powered-By');
require dirname(__DIR__) . '/lib/manifest.php';

[$status, $headers, $body] = gm_manifest_response([
    'method' => $_SERVER['REQUEST_METHOD'] ?? '',
    'path' => parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH),
    'protocol' => $_SERVER['HTTP_EXPO_PROTOCOL_VERSION'] ?? '',
    'platform' => $_SERVER['HTTP_EXPO_PLATFORM'] ?? '',
    'runtime' => $_SERVER['HTTP_EXPO_RUNTIME_VERSION'] ?? '',
    'accept' => $_SERVER['HTTP_ACCEPT'] ?? '*/*',
], dirname(__DIR__) . '/updates', dirname(__DIR__) . '/trust/certificate.pem');

http_response_code($status);
foreach ($headers as $name => $value) {
    header($name . ': ' . $value);
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'HEAD') {
    echo $body;
}
