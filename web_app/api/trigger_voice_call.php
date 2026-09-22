<?php
// Automated emergency voice call (Twilio) to the rider's emergency
// contacts, fired when the 20-second "I'm safe" countdown runs out.
// Only for a crash the signed-in rider just reported, only to contacts
// saved on their account (see lib/sos.php).
require_once __DIR__ . '/lib/bootstrap.php';
require_once __DIR__ . '/lib/sos.php';
require_once __DIR__ . '/lib/voice.php';

[$rider, $incident, $contacts] = sos_guard($conn, 'voice');

$cfg = voice_config();
if (!$cfg) {
    error_log("[Accidiox voice] twilio_voice_config.php missing or incomplete");
    json_out(["status" => "not_configured", "message" => "Voice calls aren't set up on the server yet.", "results" => []]);
}
if (!$contacts) json_out(["status" => "error", "message" => "No emergency contact saved on this account.", "results" => []]);

$input = read_json();
$place = sos_text($input['locationName'] ?? '', 120) ?: ($incident['location_name'] ?: "their current location");
$name = $incident['rider_name'] ?: "An Accidiox rider";

$lines = [
    "This is an emergency alert from Accidiox.",
    "$name may have been in a motorcycle accident near $place.",
    "Their live location has been sent to you on WhatsApp, and the nearest hospitals have been alerted.",
    "Please call them or go to them right away.",
];

$results = [];
foreach ($contacts as $c) {
    if (empty($c['phone'])) continue;
    $r = voice_call($cfg, $c['phone'], $lines);
    $results[] = ["name" => $c['name'], "phone" => voice_mask($r['to']), "called" => $r['ok'], "detail" => $r['ok'] ? "Calling now" : $r['error']];
}
add_event($conn, $incident['id'], 'CALLED', 'system', null,
    count(array_filter($results, fn($r) => $r['called'])) . " of " . count($results) . " emergency call(s) placed");

json_out(["status" => "done", "results" => $results]);
