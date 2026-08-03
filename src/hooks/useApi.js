import { useQuery, useMutation, useQueryClient } from 'react-query'
import api from '@utils/api'

export function useFetchData(endpoint, options = {}) {
  return useQuery([endpoint], () => api.get(endpoint).then(res => res.data), {
    staleTime: 5 * 60 * 1000,
    retry: 2,
    ...options,
  })
}

export function usePostData(endpoint) {
  const queryClient = useQueryClient()

  return useMutation(data => api.post(endpoint, data).then(res => res.data), {
    onSuccess: () => {
      queryClient.invalidateQueries([endpoint])
    },
  })
}
