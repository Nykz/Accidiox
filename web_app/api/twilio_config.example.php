<?php
// Copy this file to twilio_config.php and fill in real values —
// twilio_config.php itself is gitignored (never committed) because it
// holds a live API secret once deployed. Get these three values from
// the Twilio Console (console.twilio.com) after activating the
// WhatsApp Sandbox under Messaging -> Try it out -> Send a WhatsApp message.

$twilio_account_sid = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // Console home page
$twilio_auth_token   = "your_auth_token_here";               // Console home page (click "Show")
$twilio_whatsapp_from = "whatsapp:+14155238886";             // The sandbox number Twilio gives you
?>
