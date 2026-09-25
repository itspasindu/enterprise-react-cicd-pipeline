export class GithubApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message)
    this.name = 'GithubApiError'
    this.status = status ?? 502
    this.body = body
  }
}

export function createGithubClient({ token, owner, repo, fetchImpl = fetch }) {
  const baseUrl = 'https://api.github.com'
  const repoPath = `/repos/${owner}/${repo}`

  async function request(path, { searchParams, method = 'GET' } = {}) {
    const url = new URL(path.startsWith('http') ? path : `${baseUrl}${path}`)
    if (searchParams) {
      for (const [key, value] of Object.entries(searchParams)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value))
        }
      }
    }

    let response
    try {
      response = await fetchImpl(url, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'platform-api-pipeline-monitor',
        },
      })
    } catch (error) {
      throw new GithubApiError(
        `GitHub API unreachable (${error?.cause?.code || error?.code || error?.message || 'network error'})`,
        { status: 502 }
      )
    }

    const text = await response.text()
    let body = null
    if (text) {
      try {
        body = JSON.parse(text)
      } catch {
        body = text
      }
    }

    if (!response.ok) {
      const message =
        typeof body === 'object' && body?.message
          ? body.message
          : `GitHub API error (${response.status})`
      throw new GithubApiError(message, { status: response.status, body })
    }

    return body
  }

  return {
    owner,
    repo,
    get(path, options) {
      return request(path, options)
    },
    listWorkflowRuns({ workflow, perPage = 20, page = 1, status, branch } = {}) {
      const path = workflow
        ? `${repoPath}/actions/workflows/${workflow}/runs`
        : `${repoPath}/actions/runs`
      return request(path, {
        searchParams: {
          per_page: perPage,
          page,
          status,
          branch,
        },
      })
    },
    getWorkflowRun(runId) {
      return request(`${repoPath}/actions/runs/${runId}`)
    },
    listJobsForRun(runId) {
      return request(`${repoPath}/actions/runs/${runId}/jobs`, {
        searchParams: { per_page: 100 },
      })
    },
    listArtifactsForRun(runId) {
      return request(`${repoPath}/actions/runs/${runId}/artifacts`, {
        searchParams: { per_page: 100 },
      })
    },
    listIssues({ labels, state = 'open', perPage = 30, page = 1 } = {}) {
      return request(`${repoPath}/issues`, {
        searchParams: {
          state,
          labels,
          per_page: perPage,
          page,
          sort: 'updated',
          direction: 'desc',
        },
      })
    },
  }
}
