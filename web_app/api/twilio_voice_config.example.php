<?php
// Twilio Cloud Voice API Configuration (Free Trial Credits Supported)
// 1. Sign up for a free Twilio account at https://www.twilio.com/try-twilio ($15.50 free trial credits included)
// 2. Get your Account SID, Auth Token, and a free Twilio Phone Number
// 3. Paste them below and save/rename this file as twilio_voice_config.php

$twilio_account_sid  = "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // Your Twilio Account SID
$twilio_auth_token   = "your_twilio_auth_token_here";         // Your Twilio Auth Token
$twilio_from_number  = "+1234567890";                          // Your Twilio Phone Number (with +)

// Text-To-Speech (TTS) Voice Configuration
$twilio_voice_actor    = "Polly.Aditi"; // Indian English female voice (or "alice")
$twilio_voice_language = "en-IN";
?>
