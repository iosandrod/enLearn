# Chat Socket Development Plan

## Stage 1: Foundation

- Add chat data tables for conversations, members, messages, read state, reactions, and attachments.
- Add `ChatModule`, `ChatService`, and `ChatGateway` to the Nest API.
- Keep historical reads and management commands on the existing `/api/service` gateway.
- Use Socket.IO only for live events such as message delivery, typing, read updates, and presence.
- Add Nuxt composables for chat HTTP methods and socket connection lifecycle.

## Stage 2: Core Chat UI

- Build a dashboard chat page with conversation list, message timeline, and composer.
- Support direct conversations, group conversations, pagination, unread counts, and optimistic sending.
- Reconcile optimistic client messages with server-confirmed messages through `requestId`.

## Stage 3: Rich Message Features

- Reuse the existing file storage module for image and file attachments.
- Add message edit, delete, reply, reactions, and mentions.
- Connect mentions and offline direct messages to the notification center.

## Stage 4: Operational Hardening

- Add Redis Socket.IO adapter for multi-instance deployments.
- Add rate limits, payload size limits, connection metrics, and audit records.
- Add delivery receipts, retry handling, and dead-letter logging for failed server-side notifications.

## Stage 5: Admin And Compliance

- Add moderation/search views for permitted admins.
- Add retention settings, export tools, and tenant-level controls.
- Add expanded tests for RLS, authorization, gateway events, and frontend reconnection behavior.

