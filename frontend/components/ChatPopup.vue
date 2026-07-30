<template>
  <ChatPopupWidget
    :api="chatApi"
    :socket="chatSocket"
    :current-user-id="auth.user.value?.id ?? ''"
  />
</template>

<script setup lang="ts">
import { ChatPopupWidget } from '@enlearn/chat-widget';

const auth = useAuth();
const chatApi = useChatApi();
const chatSocket = useChatSocket();
</script>

