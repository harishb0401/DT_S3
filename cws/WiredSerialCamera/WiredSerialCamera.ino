/**
 * Wired Serial Camera Streamer for ESP32-CAM (AI-THINKER)
 * --------------------------------------------------------
 * Stream JPEG frames directly over the hardware UART / USB cable
 * to the web browser via Web Serial API.
 * 
 * Works with both:
 *  - Hardware JPEG sensors (OV2640, OV3660, OV5640)
 *  - Non-JPEG sensors (OV7670, GC0308, OV7725) via software JPEG compression
 *  - Boards with or without PSRAM enabled
 * 
 * Hardware Wiring via Arduino Uno:
 * 1. ESP32-CAM 5V  -> Arduino 5V
 * 2. ESP32-CAM GND -> Arduino GND
 * 3. ESP32-CAM U0T (TX) -> Arduino Pin 0 (RX)
 * 4. ESP32-CAM U0R (RX) -> Arduino Pin 1 (TX)
 * IMPORTANT: To use Arduino Uno purely as a USB-to-UART bridge without
 * ATmega328P interference, connect Arduino RESET pin directly to GND!
 */

#include "esp_camera.h"
#include "img_converters.h"

// Camera pin definition for AI-THINKER ESP32-CAM
#define PWDN_GPIO_NUM     32
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM      0
#define SIOD_GPIO_NUM     26
#define SIOC_GPIO_NUM     27

#define Y9_GPIO_NUM       35
#define Y8_GPIO_NUM       34
#define Y7_GPIO_NUM       39
#define Y6_GPIO_NUM       36
#define Y5_GPIO_NUM       21
#define Y4_GPIO_NUM       19
#define Y3_GPIO_NUM       18
#define Y2_GPIO_NUM        5
#define VSYNC_GPIO_NUM    25
#define HREF_GPIO_NUM     23
#define PCLK_GPIO_NUM     22

void setup() {
  Serial.begin(1000000);
  delay(500);

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

  if (psramFound()) {
    config.fb_location = CAMERA_FB_IN_PSRAM;
    config.fb_count = 2;
    config.pixel_format = PIXFORMAT_RGB565;
    config.frame_size = FRAMESIZE_QVGA;  // 320x240
  } else {
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
    config.pixel_format = PIXFORMAT_RGB565;
    config.frame_size = FRAMESIZE_QQVGA; // 160x120 (fits in DRAM)
  }

  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    config.frame_size = FRAMESIZE_96X96;
    err = esp_camera_init(&config);
  }

  sensor_t *s = esp_camera_sensor_get();
  if (s != NULL) {
    s->set_vflip(s, 1);
    s->set_brightness(s, 1);
    s->set_saturation(s, 0);
  }
}

void loop() {
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    delay(10);
    return;
  }

  if (fb->format == PIXFORMAT_JPEG) {
    Serial.write(fb->buf, fb->len);
  } else {
    uint8_t *jpg_buf = NULL;
    size_t jpg_len = 0;
    if (frame2jpg(fb, 80, &jpg_buf, &jpg_len)) {
      Serial.write(jpg_buf, jpg_len);
      free(jpg_buf);
    }
  }

  esp_camera_fb_return(fb);
  delay(15);
}
