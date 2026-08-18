# Native Host Delivery Checklist

The Vue runtime is ready to embed, but Android and iOS packaging remains a
native release task. Use the same `EnLearnMobile` app name and pass these Hippy
initial properties:

```json
{
  "apiBaseUrl": "https://your-api.example.com/api",
  "pageCode": "sales-orders",
  "path": "/",
  "accessToken": "",
  "accountId": "",
  "userId": ""
}
```

## Android

- Embed `dist/android/index.android.js` and `vendor.android.js` in the Hippy
  engine or configure the production bundle URL used by your release channel.
- Register the promise-based `EnLearnMES` native module.
- Add camera, media/file picker, network-state, notification, and vibration
  permissions appropriate to the supported Android API levels.
- Back the scanner with a maintained barcode engine such as ML Kit Barcode
  Scanning or ZXing Android Embedded.
- Use the system photo picker and Storage Access Framework where available.
- Upload files as a streaming request. Do not decode large files into JS or
  base64.
- Obtain and refresh the FCM token, then return it from `getPushToken`.

## iOS

- Embed `dist/ios/index.ios.js` and `vendor.ios.js` in the Hippy engine or use
  the approved production bundle URL.
- Register the promise-based `EnLearnMES` native module.
- Add camera and photo-library usage descriptions, notification capability,
  and network-state handling.
- Back scanning with VisionKit/DataScanner where supported, with an
  AVFoundation fallback for older supported versions.
- Use `PHPickerViewController` and the document picker for media/files.
- Stream signed uploads from the file URL with `URLSession`.
- Obtain and refresh the APNs/provider token, then return it from
  `getPushToken`.

## Release gates

- Verify cold start, resume, deep link, token refresh, account switch, offline
  read, queued write replay, camera/upload, scan, push open, safe area, soft
  keyboard, hardware back, and nested overlays on physical devices.
- Encrypt native storage at rest when cached MES payloads can contain sensitive
  production or personnel data. The JS runtime provides identity isolation,
  TTL, bounded retention, and sign-out cleanup; OS-backed encryption belongs to
  the host storage implementation.
- Pin API TLS, signing, bundle update, crash reporting, and release-channel
  policies in the native application, outside low-code Schema.
