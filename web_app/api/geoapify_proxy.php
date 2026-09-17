<?php
// Forwards reverse-geocoding and nearby-places lookups to Geoapify,
// keeping the real API key server-side only (never shipped in the
// public, git-tracked frontend JS). Passes through Geoapify's own JSON
// response shape unchanged, so the frontend parses it exactly as if it
// had called Geoapify directly.
header("Access-Control-Allow-Origin: *");
header("Content-Type: application/json");

if (!file_exists(__DIR__ . '/geoapify_config.php')) {
    http_response_code(200);
    echo json_encode(["error" => "geoapify_config.php not set up yet"]);
    exit();
}
require_once 'geoapify_config.php';

$type = isset($_GET['type']) ? $_GET['type'] : '';
$lat  = isset($_GET['lat']) ? (float) $_GET['lat'] : null;
$lon  = isset($_GET['lon']) ? (float) $_GET['lon'] : null;

if ($lat === null || $lon === null) {
    http_response_code(400);
    echo json_encode(["error" => "lat and lon are required"]);
    exit();
}

if ($type === 'reverse') {
    $url = "https://api.geoapify.com/v1/geocode/reverse?lat={$lat}&lon={$lon}&format=json&apiKey={$geoapify_api_key}";
} elseif ($type === 'places') {
    $category = isset($_GET['category']) ? $_GET['category'] : '';
    $allowed = ['healthcare.hospital', 'service.police', 'service.vehicle.fuel'];
    if (!in_array($category, $allowed, true)) {
        http_response_code(400);
        echo json_encode(["error" => "invalid category"]);
        exit();
    }
    $url = "https://api.geoapify.com/v2/places?categories={$category}" .
        "&filter=circle:{$lon},{$lat},8000&bias=proximity:{$lon},{$lat}&limit=15&apiKey={$geoapify_api_key}";
} else {
    http_response_code(400);
    echo json_encode(["error" => "type must be 'reverse' or 'places'"]);
    exit();
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_TIMEOUT, 10);
$response = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$curlErr  = curl_error($ch);
curl_close($ch);

if ($curlErr) {
    http_response_code(502);
    echo json_encode(["error" => $curlErr]);
    exit();
}

http_response_code($httpCode);
echo $response;
?>
