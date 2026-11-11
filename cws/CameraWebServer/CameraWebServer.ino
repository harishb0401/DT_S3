#include <Arduino.h>
#include "esp_camera.h"
#include <WiFi.h>

// ===========================
// Select camera model in board_config.h
// ===========================
#include "board_config.h"

// ===========================
// Enter your WiFi credentials
// ===========================
const char *ssid = "Harish_047";
const char *password = "Harish@4000";

void startCameraServer();
void setupLedFlash();

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 16000000;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.jpeg_quality = 12;

#if defined(CAMERA_MODEL_ESP_EYE)
  pinMode(13, INPUT_PULLUP);
  pinMode(14, INPUT_PULLUP);
#endif

  // -------------------------------------------------------------------------
  // Automatic Memory & Sensor Auto-Configuration:
  // Prevents "frame buffer malloc failed" by checking PSRAM availability.
  // -------------------------------------------------------------------------
  esp_err_t err;

  if (psramFound()) {
    Serial.println("[ESP32-CAM] PSRAM detected (4MB external RAM available).");
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;

    // Try hardware JPEG first (OV2640/OV3660)
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size = FRAMESIZE_VGA;
    config.jpeg_quality = 10;
    err = esp_camera_init(&config);

    if (err != ESP_OK) {
      Serial.printf("[ESP32-CAM] Hardware JPEG returned 0x%x. Switching to RGB565 in PSRAM...\n", err);
      config.pixel_format = PIXFORMAT_RGB565;
      config.frame_size = FRAMESIZE_QVGA;  // 320x240 (150 KB fits easily in 4MB PSRAM)
      config.fb_count = 2;
      config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
      err = esp_camera_init(&config);
    }
  } else {
    Serial.println("[ESP32-CAM] WARNING: PSRAM is NOT enabled in Tools menu!");
    Serial.println("[ESP32-CAM] Allocating in internal DRAM. Using QQVGA to prevent malloc failure.");
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
    config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
    config.pixel_format = PIXFORMAT_RGB565;
    config.frame_size = FRAMESIZE_QQVGA;  // 160x120 (38 KB fits safely in internal contiguous RAM)
    err = esp_camera_init(&config);

    if (err != ESP_OK) {
      config.frame_size = FRAMESIZE_96X96;
      err = esp_camera_init(&config);
    }
  }

  if (err != ESP_OK) {
    Serial.printf("[ESP32-CAM] Camera init failed with error 0x%x\n", err);
    Serial.println("[ESP32-CAM] If on Arduino IDE: Ensure Tools -> Board is 'AI Thinker ESP32-CAM' and Tools -> PSRAM is 'Enabled'.");
    return;
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s != NULL) {
    // initial sensors are flipped vertically and colors are a bit saturated
    if (s->id.PID == OV3660_PID) {
      s->set_vflip(s, 1);        // flip it back
      s->set_brightness(s, 1);   // up the brightness just a bit
      s->set_saturation(s, -2);  // lower the saturation
    }
    
    // Flip vertically for AI-THINKER module mounting
    s->set_vflip(s, 1);

    if (config.pixel_format == PIXFORMAT_JPEG) {
      s->set_framesize(s, FRAMESIZE_VGA);
    } else {
      s->set_framesize(s, FRAMESIZE_QVGA);
    }
  }

#if defined(CAMERA_MODEL_M5STACK_WIDE) || defined(CAMERA_MODEL_M5STACK_ESP32CAM)
  s->set_vflip(s, 1);
  s->set_hmirror(s, 1);
#endif

#if defined(CAMERA_MODEL_ESP32S3_EYE)
  s->set_vflip(s, 1);
#endif

// Setup LED FLash if LED pin is defined in camera_pins.h
#if defined(LED_GPIO_NUM)
  setupLedFlash();
#endif

  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.print("WiFi connecting to: ");
  Serial.println(ssid);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("");
  Serial.println("==================================================");
  Serial.println("  ESP32-CAM College Bus Pass Camera Online!        ");
  Serial.println("==================================================");
  Serial.print("WiFi Connected! IP Address: ");
  Serial.println(WiFi.localIP());
  Serial.print("Stream URL:  http://");
  Serial.print(WiFi.localIP());
  Serial.println(":81/stream");
  Serial.print("Capture URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/capture");
  Serial.println("==================================================");

  startCameraServer();
}

void loop() {
  // Do nothing. Everything is done in another task by the web server
  delay(10000);
}
