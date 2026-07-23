<template>
  <section class="stack">
    <div class="content-panel">
      <h2 class="page-title">{{ editingId ? 'Edit Post' : 'Create New Post' }}</h2>
      <p class="page-description">
        This form is rendered from a schema object and writes through the Nuxt API.
      </p>

      <LowCodeForm
        v-model="postForm"
        :schema="postFormSchema"
        :loading="loading"
        @submit="savePost"
        @action="handlePostFormAction"
      />
    </div>

    <div class="content-panel">
      <LowCodeGrid
        :schema="postsGridSchema"
        :rows="posts"
        :loading="loading"
        @toolbar="handleToolbar"
        @edit="editPost"
        @delete="deletePost"
      />
    </div>

    <p v-if="message" :class="messageClass">{{ message }}</p>
  </section>
</template>

<script setup lang="ts">
import { postFormSchema, postsGridSchema } from '~/schemas/posts';
import type { PostRow } from '~/types/database';

definePageMeta({
  layout: 'dashboard',
  middleware: 'auth'
});

const postsApi = usePostsApi();
const loading = ref(false);
const message = ref('');
const messageClass = ref('lc-help');
const editingId = ref<number | null>(null);
const posts = ref<PostRow[]>([]);
const postForm = ref<Record<string, unknown>>({
  title: '',
  content: ''
});

async function loadPosts() {
  loading.value = true;

  try {
    posts.value = await postsApi.list();
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Could not load posts.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

async function savePost(values: Record<string, unknown>) {
  loading.value = true;
  message.value = '';

  const payload = {
    title: String(values.title),
    content: values.content ? String(values.content) : null
  };

  try {
    if (editingId.value) {
      await postsApi.update(editingId.value, payload);
      message.value = 'Post updated successfully.';
    } else {
      await postsApi.create(payload);
      message.value = 'Post created successfully.';
    }

    messageClass.value = 'lc-help';
    resetPostForm();
    await loadPosts();
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Post could not be saved.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

function editPost(row: Record<string, unknown>) {
  const post = row as PostRow;
  editingId.value = post.id;
  postForm.value = {
    title: post.title,
    content: post.content ?? ''
  };
}

async function deletePost(row: Record<string, unknown>) {
  const post = row as PostRow;
  loading.value = true;

  try {
    await postsApi.remove(post.id);
    message.value = 'Post deleted successfully.';
    messageClass.value = 'lc-help';
    await loadPosts();
  } catch (error) {
    message.value =
      error instanceof Error ? error.message : 'Post could not be deleted.';
    messageClass.value = 'lc-error';
  } finally {
    loading.value = false;
  }
}

function resetPostForm() {
  editingId.value = null;
  postForm.value = {
    title: '',
    content: ''
  };
}

function handlePostFormAction(action: { code: string }) {
  if (action.code === 'reset') {
    resetPostForm();
  }
}

function handleToolbar(code: string) {
  if (code === 'refresh') {
    loadPosts();
  }
}

onMounted(loadPosts);
</script>
