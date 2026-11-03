import type { EngineInterface, Register } from 'claude-code'

const COPIED_MS = 1800

// What the desktop app knows about this session; refreshed, never required.
type Info = { title?: string }

let info: Info = {}
let isCopied = false

// The desktop app addresses a session by its `local_…` id; a terminal
// session has none, and falls back to the engine's own id.
async function address($: EngineInterface) {
  const host = await $.env.get('CLAUDE_CODE_HOST_SESSION_ID')
  if (host) return { id: host, isDesktop: true }

  return { id: await $.session.id(), isDesktop: false }
}

// The title comes from the desktop app's own session tool. That server
// connects some time after the session starts, so a miss is silent: the
// next turn asks again, and the copied line goes without a title meanwhile.
async function refresh($: EngineInterface) {
  try {
    const result = await Promise.race([
      $.mcp.call('ccd_session_mgmt', 'get_session', { session_id: 'self' }),
      $.clock.sleep(2000).then(
        () => undefined,
        () => undefined,
      ),
    ])
    const text = result?.content.find(block => block.type === 'text')?.text
    if (!text) return
    const session = JSON.parse(text) as { title?: unknown }
    info = {
      title: typeof session.title === 'string' ? session.title : undefined,
    }
  } catch {
    // Not connected yet, or not a desktop session.
  }
}

function handoff(id: string) {
  const who = info.title ? `Peer session "${info.title}"` : 'Peer session'

  return `${who} has the id ${id}.`
}

// The surface's own clipboard first; a desktop on this machine may not take
// a plugin's copy yet, so the Mac's clipboard stands in for it.
async function copy($: EngineInterface, surface: string, text: string) {
  const ui = await $.ui
    .copy({ text, surface: surface as never })
    .catch(() => ({ isCopied: false as const }))
  if (ui.isCopied) return true
  const ran = await $.process
    .run(['pbcopy'], { stdin: text })
    .catch(() => undefined)

  return ran?.exitCode === 0
}

async function press($: EngineInterface, surface: string) {
  await refresh($)
  const { id } = await address($)
  if (!(await copy($, surface, handoff(id)))) {
    $.ui.toast(`Could not copy. The id is ${id}`)
    return
  }
  isCopied = true
  $.ui.invalidate('ui.render')
  const isWaited = await $.clock.sleep(COPIED_MS).then(
    () => true,
    () => false,
  )
  if (!isWaited) return
  isCopied = false
  $.ui.invalidate('ui.render')
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'session-address',
      description: "Print this session's address, ready to hand to another session",
    })
    const started = await next(e)
    if ((await address($)).isDesktop) void refresh($)

    return started
  })

  // Prints the line where no clipboard reaches, as on the phone.
  on('command.run', { command: 'session-address' }, async $ => {
    const { id, isDesktop } = await address($)
    if (isDesktop) await refresh($)

    return { text: handoff(id) }
  })

  // A rename shows up after the next turn.
  on('turn.complete', async ($, e, next) => {
    if ((await address($)).isDesktop) void refresh($)

    return next(e)
  })

  // A quiet button beside the mode labels in the desktop's prompt footer.
  on('ui.render', { component: 'SessionMode' }, async ($, e, next) => {
    if (e.surface !== 'desktop') return next(e)
    if (!(await address($)).isDesktop) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const { modes } = e.props

    return (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {modes.length > 0 && <Text dimColor>{modes.join(' & ')}</Text>}
        {/* The desktop sizes its button to the footer's text and draws no
            padding or border of a Box here. */}
        <Button
          key="copy-session"
          variant="secondary"
          label={isCopied ? '✓ Copied' : '⧉ Copy session'}
          onPress={pressed => void press($, pressed.surface)}
        />
      </Box>
    )
  })
}
