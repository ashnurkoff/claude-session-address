import { expect, mock, test } from 'claude-code/testing'

const ID = 'local_00000000-0000-4000-8000-000000000000'

const FOOTER = {
  plugin: 'session-address',
  component: 'SessionMode',
  props: { modes: [] as string[] },
} as const

const SESSION = {
  value: {
    content: [{ type: 'text', text: JSON.stringify({ title: 'Demo' }) }],
    isError: false,
  },
}

test('the footer button copies the line for an agent, then resets', async ($, on) => {
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: ID })
  const clock = mock.clock(on)
  on('mcp.call', () => SESSION)
  const copies: string[] = []
  on('ui.copy', (_, e) => {
    copies.push(e.text)
    return { value: { isCopied: true } }
  })

  const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  expect((await ui.find({ key: 'copy-session' }))?.text).toBe('⧉ Copy session')
  await ui.press({ key: 'copy-session' })

  expect(copies[0]).toBe(`Peer session "Demo" has the id ${ID}.`)
  expect((await ui.find({ key: 'copy-session' }))?.text).toBe('✓ Copied')

  await clock.advance(2000)
  expect((await ui.find({ key: 'copy-session' }))?.text).toBe('⧉ Copy session')
  await ui.unmount()
})

test('the footer keeps the mode labels beside the button', async ($, on) => {
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: ID })
  mock.clock(on)

  const ui = await $.ui.mount({
    ...FOOTER,
    props: { modes: ['focus', 'memory paused'] },
    surface: 'desktop',
  })

  expect((await ui.find({ type: 'Text', text: /focus/ }))?.text).toBe(
    'focus & memory paused',
  )
  await ui.unmount()
})

test('a surface that will not copy falls back to pbcopy', async ($, on) => {
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: ID })
  mock.clock(on)
  on('mcp.call', () => SESSION)
  on('ui.copy', () => ({ value: { isCopied: false, reason: 'no-clipboard' } }))
  const runs: { argv: readonly string[]; stdin?: string }[] = []
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv, stdin: e.init?.stdin })
    return {
      value: {
        exitCode: 0,
        stdout: '',
        stderr: '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })

  const ui = await $.ui.mount({ ...FOOTER, surface: 'desktop' })
  await ui.press({ key: 'copy-session' })

  expect(runs[0]?.argv).toEqual(['/usr/bin/pbcopy'])
  expect(runs[0]?.stdin).toContain(ID)
  await ui.unmount()
})

test('outside a desktop session the footer is the engine own', async ($, on) => {
  mock.env(on, {})
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>engine</Text>
  })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...FOOTER, surface })
    expect((await ui.find({ type: 'Text' }))?.text).toBe('engine')
    expect(await ui.find({ key: 'copy-session' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the command prints the line for an agent', async ($, on) => {
  mock.env(on, { CLAUDE_CODE_HOST_SESSION_ID: ID })
  mock.clock(on)
  on('mcp.call', () => SESSION)

  const ran = await $.command.run({ command: 'session-address', args: '' } as never)

  expect(ran.text).toBe(`Peer session "Demo" has the id ${ID}.`)
})
