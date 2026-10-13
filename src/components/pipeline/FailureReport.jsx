import StatusBadge from './StatusBadge'

function ExternalLink({ href, children }) {
  if (!href) return <span>{children}</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-blue-700 hover:underline"
    >
      {children}
    </a>
  )
}

function timeAgo(iso) {
  if (!iso) return ''
  const delta = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(delta / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function SummaryGrid({ summary = {} }) {
  const rows = [
    { label: 'Overall', value: summary.overall },
    {
      label: 'Workflow run',
      value: summary.runLabel,
      href: summary.runUrl,
    },
    {
      label: 'Commit',
      value: summary.commitLabel,
      href: summary.commitUrl,
    },
    { label: 'Message', value: summary.commitMessage },
    { label: 'Branch', value: summary.branch },
    {
      label: 'Pull request',
      value: summary.prLabel,
      href: summary.prUrl,
    },
    { label: 'Triggered by', value: summary.triggeredBy },
    {
      label: 'Artifacts',
      value: summary.artifactsLabel || (summary.artifactsUrl ? 'Download from run' : null),
      href: summary.artifactsUrl,
    },
  ].filter(row => row.value || row.href)

  if (!rows.length) return null

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {rows.map(row => (
        <div
          key={row.label}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        >
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {row.label}
          </dt>
          <dd className="mt-1 text-slate-800">
            {row.href ? (
              <ExternalLink href={row.href}>{row.value || 'Open'}</ExternalLink>
            ) : (
              row.value
            )}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function FailureReport({ report, comments = [], compact = false }) {
  if (!report) {
    return <p className="text-sm text-slate-500">No report body available for this problem.</p>
  }

  const structured = report.hasStructuredReport

  return (
    <div className="space-y-5" data-testid="failure-report">
      {structured ? (
        <>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Summary</h3>
            <SummaryGrid summary={report.summary} />
          </section>

          {(report.checklist || []).length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Failed stages</h3>
              <ul className="space-y-1.5">
                {report.checklist.map(item => (
                  <li
                    key={item.text}
                    className="flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
                  >
                    <span aria-hidden>{item.done ? '☑' : '☐'}</span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {(report.stages || []).length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">All stage results</h3>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Stage</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Logs</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {report.stages.map(stage => (
                      <tr key={stage.name}>
                        <td className="px-3 py-2 text-slate-800">{stage.name}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={stage.status || 'unknown'} />
                        </td>
                        <td className="px-3 py-2">
                          {stage.logsUrl ? (
                            <ExternalLink href={stage.logsUrl}>
                              {stage.logsLabel || 'View logs'}
                            </ExternalLink>
                          ) : (
                            <span className="text-slate-500">{stage.logsLabel || '—'}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {report.reproduce && !compact ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Reproduce locally</h3>
              <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-900 px-3 py-3 text-xs text-slate-100">
                {report.reproduce}
              </pre>
            </section>
          ) : null}

          {report.investigation && !compact ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Investigation guide</h3>
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                {report.investigation}
              </pre>
            </section>
          ) : null}

          {report.fixPath && !compact ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-900">Fix path</h3>
              <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                {report.fixPath}
              </pre>
            </section>
          ) : null}
        </>
      ) : report.rawBody ? (
        <pre className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
          {report.rawBody}
        </pre>
      ) : (
        <p className="text-sm text-slate-500">No report body available for this problem.</p>
      )}

      {(comments || []).length ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-900">Updates</h3>
          <ul className="space-y-2">
            {comments.map(comment => (
              <li
                key={comment.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm"
              >
                <p className="text-xs text-slate-500">
                  {comment.author || 'unknown'} · {timeAgo(comment.createdAt)}
                  {comment.htmlUrl ? (
                    <>
                      {' '}
                      · <ExternalLink href={comment.htmlUrl}>GitHub</ExternalLink>
                    </>
                  ) : null}
                </p>
                <pre className="mt-2 whitespace-pre-wrap text-slate-800">{comment.body}</pre>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export default FailureReport
