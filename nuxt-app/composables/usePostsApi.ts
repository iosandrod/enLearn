import type { PostRow } from '~/types/database';

type PostPayload = {
  title: string;
  content: string | null;
};

export function usePostsApi() {
  const { request } = useAuthenticatedFetch();

  async function list() {
    return request<PostRow[]>('/api/posts');
  }

  async function create(payload: PostPayload) {
    return request<PostRow>('/api/posts', {
      method: 'POST',
      body: payload
    });
  }

  async function update(id: number, payload: PostPayload) {
    return request<PostRow>(`/api/posts/${id}`, {
      method: 'PUT',
      body: payload
    });
  }

  async function remove(id: number) {
    return request<{ success: boolean }>(`/api/posts/${id}`, {
      method: 'DELETE'
    });
  }

  return { list, create, update, remove };
}
