// Testes de ponta a ponta do TerraTurn no desktop, iPhone (Chrome e Safari/WebKit) e Android,
// com a IA sempre simulada (nenhuma chamada à Anthropic).
// Requer o backend (DEMO_EDITABLE=true, DEMO_AUTOGENERATE=false, sem ANTHROPIC_API_KEY) e o frontend rodando.
// Uso: E2E_BASE_URL=http://localhost:5173 npm run test:e2e
import { test, describe, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { chromium, webkit, devices } = require('playwright')
const BASE = process.env.E2E_BASE_URL || 'http://localhost:5173'
const SHOTS = process.env.E2E_SCREENSHOTS || 'e2e-screenshots'
mkdirSync(SHOTS, { recursive: true })

const STYLE = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#cfd8c4' } }] }
const AI_ANSWER = '**Rain on your farm**\n\n- **May:** 109 mm\n- **June:** 92 mm\n\nPlan sowing after the rains settle.'
// Palavras e letras que só aparecem em português (o espanhol compartilha acentos, por isso a lista é restrita).
const PT = /[ãõçêô]|\b(não|você|sua|seu|uma|ou|em|ao|com|fazenda|fazendas|propriedade|propriedades|safra|safras|dados|cultura|clique|arraste|carregando|selecione|informe|desta|nesta|pelo|pela)\b/i
// Fazendas da demo usadas no teste do editor (as de Uberaba têm município e listas locais de estado/município).
const PROFILES = {
  desktop: { engine: 'chromium', mobile: false, farm: 'Uberaba A', opts: { viewport: { width: 1440, height: 900 } } },
  'iphone-chrome': { engine: 'chromium', mobile: true, farm: 'Uberaba B', opts: devices['iPhone 13'] },
  'iphone-safari': { engine: 'webkit', mobile: true, farm: 'Uberaba A', opts: devices['iPhone 13'] },
  android: { engine: 'chromium', mobile: true, farm: 'Uberaba B', opts: devices['Pixel 7'] },
}

// O WebKit (motor do Safari) pode não estar instalado localmente; nesse caso o perfil é pulado.
const browsers = {}
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  try { browsers[name] = await type.launch() } catch { browsers[name] = null }
}
after(async () => { for (const b of Object.values(browsers)) await b?.close() })

async function open(profile, { language = 'en', path = '/demo' } = {}) {
  const ctx = await browsers[PROFILES[profile].engine].newContext(PROFILES[profile].opts)
  await ctx.addInitScript(l => { try { localStorage.setItem('terraturn-language', l) } catch {} }, language)
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  // O WebKit registra como "access control checks" uma requisição do próprio site cancelada por mudança de página
  // (por exemplo, ao sair da conta); isso não é erro da aplicação.
  const cancelled = t => /due to access control checks/.test(t) && t.includes(new URL(BASE).host)
  page.on('console', m => { if (m.type() === 'error' && !cancelled(m.text()) && !/Failed to load resource|net::ERR|404|403|blocked|arcgisonline|opentopomap|mapterhorn|gibs\.earthdata/i.test(m.text())) errors.push(m.text()) })
  // Mapa base e imagens de satélite externos ficam fora do teste; a IA é simulada.
  await page.route(/tiles\.openfreemap\.org/, r => r.fulfill({ json: STYLE }))
  await page.route(/arcgisonline|opentopomap|mapterhorn|gibs\.earthdata/, r => r.abort())
  await page.route('**/api/v1/ai/chat', r => r.fulfill({ json: { answer: AI_ANSWER, farm_data: true } }))
  await page.goto(BASE + path)
  if (path.startsWith('/demo')) await page.locator('.function-rail').waitFor()
  await page.waitForTimeout(1500)
  return { ctx, page, errors }
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` })
const noHorizontalScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
const farms = page => page.evaluate(() => fetch('/api/v1/farms').then(r => r.json()))

async function openPanel(page, profile, index) {
  // desktop: 0 visão geral, 1 propriedades, 2 planejamento, 3 clima, 4 camadas, 5 assistente
  // celular: 0 mapa, 1 resumo, 2 plano, 3 clima, 4 IA
  const btn = page.locator('.function-rail .rail-functions button:visible').nth(index)
  if (await btn.getAttribute('aria-expanded') === 'true') return
  await btn.click()
  await page.waitForTimeout(600)
}

async function portugueseTexts(page, ignore) {
  const items = await page.evaluate(() => {
    const out = []
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      const t = n.textContent.trim(), el = n.parentElement
      if (!t || !el || el.closest('script,style')) continue
      const r = el.getBoundingClientRect()
      if (r.width || r.height) out.push(t)
    }
    for (const el of document.querySelectorAll('[aria-label],[placeholder],[title]'))
      for (const a of ['aria-label', 'placeholder', 'title']) { const v = el.getAttribute(a); if (v) out.push(v) }
    return out
  })
  return [...new Set(items)].filter(t => PT.test(t) && !ignore.some(i => t.includes(i)))
}

for (const [profile, P] of Object.entries(PROFILES)) {
  describe(profile, { skip: browsers[P.engine] ? false : `${P.engine} não instalado` }, () => {
    test('páginas públicas abrem sem erro e sem rolagem horizontal', async () => {
      for (const path of ['/login', '/register', '/forgot-password', '/privacy']) {
        const { ctx, page, errors } = await open(profile, { path })
        assert.ok(await noHorizontalScroll(page), `${path} tem rolagem horizontal`)
        assert.ok((await page.locator('body').innerText()).trim().length > 50, `${path} vazia`)
        assert.deepEqual(errors, [], `${path}: erros no console`)
        await shot(page, `${profile}-${path.slice(1)}`)
        await ctx.close()
      }
    })

    test('demo abre com as 9 fazendas, sem erro e sem rolagem horizontal', async () => {
      const { ctx, page, errors } = await open(profile)
      assert.equal((await farms(page)).length, 9)
      assert.ok(await noHorizontalScroll(page))
      assert.deepEqual(errors, [])
      await shot(page, `${profile}-demo`)
      await ctx.close()
    })

    test('navegação mostra os itens certos para cada tela', async () => {
      const { ctx, page } = await open(profile)
      const visible = await page.locator('.function-rail .rail-functions button:visible').count()
      if (!P.mobile) {
        assert.equal(visible, 6, 'barra lateral com 6 itens')
        assert.equal(await page.locator('.rail-short:visible, .map-account:visible').count(), 0, 'itens do celular aparecendo no desktop')
      } else {
        assert.deepEqual(await page.locator('.function-rail .rail-short:visible').allInnerTexts(), ['Map', 'Overview', 'Plan', 'Climate', 'AI'])
        const nav = await page.locator('.function-rail').boundingBox()
        assert.ok(nav.y + nav.height >= P.opts.viewport.height - 2, 'barra de navegação não está no rodapé')
      }
      const panels = !P.mobile ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4]
      for (const i of panels) {
        await openPanel(page, profile, i)
        assert.ok(await page.locator('.workspace-panel h1').isVisible(), `painel ${i} não abriu`)
        await shot(page, `${profile}-painel-${i}`)
      }
      await ctx.close()
    })

    test('chat da IA: markdown formatado e histórico mantido ao fechar', async () => {
      const { ctx, page } = await open(profile)
      if (!P.mobile) await openPanel(page, profile, 0) // fecha o painel para o botão da IA aparecer
      await page.locator('.ai-fab').click()
      await page.locator('.chat-compose input').fill('How much rain?')
      await page.keyboard.press('Enter')
      await page.locator('.chat-bubble strong', { hasText: 'Rain on your farm' }).waitFor()
      const chat = await page.locator('.ai-chat').innerText()
      assert.ok(!chat.includes('**'), 'asteriscos aparecendo')
      assert.equal(await page.locator('.ai-chat .md li').count(), 2)
      const before = await page.locator('.ai-chat .chat-message').count()
      await shot(page, `${profile}-chat`)
      await page.locator('.ai-chat').getByRole('button', { name: 'Close' }).click()
      await page.locator('.ai-fab').click()
      assert.equal(await page.locator('.ai-chat .chat-message').count(), before, 'histórico perdido ao reabrir')
      await page.reload(); await page.locator('.function-rail').waitFor(); await page.waitForTimeout(1000)
      if (!P.mobile) await openPanel(page, profile, 0)
      await page.locator('.ai-fab').click()
      assert.equal(await page.locator('.ai-chat .chat-message').count(), before, 'histórico perdido ao recarregar')
      await ctx.close()
    })

    for (const language of ['en', 'es']) {
      test(`nenhum texto da interface em português no idioma ${language}`, async () => {
        const { ctx, page } = await open(profile, { language })
        const data = await farms(page)
        const ignore = [...new Set(data.flatMap(f => [f.name, f.state, f.municipality, f.country, f.locality]).filter(Boolean))]
        const found = new Map()
        const scan = async where => { for (const t of await portugueseTexts(page, ignore)) if (!found.has(t)) found.set(t, where) }
        await scan('mapa')
        const panels = !P.mobile ? [0, 1, 2, 3, 4, 5] : [1, 2, 3, 4]
        for (const i of panels) {
          await openPanel(page, profile, i)
          await page.locator('.workspace-panel-scroll').evaluate(e => e.scrollTo(0, e.scrollHeight)).catch(() => {})
          await scan(`painel ${i}`)
        }
        assert.deepEqual(Object.fromEntries(found), {}, 'textos em português encontrados')
        await ctx.close()
      })
    }

    if (P.mobile) {
      test('celular: todo texto da interface com pelo menos 16px', async () => {
        const { ctx, page } = await open(profile)
        const small = new Map()
        const scan = async where => {
          const r = await page.evaluate(() => {
            const out = []
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
            let n
            while ((n = w.nextNode())) {
              const el = n.parentElement
              if (!n.textContent.trim() || !el || el.closest('svg,script,style,.maplibregl-ctrl-attrib,.leaflet-control-attribution')) continue
              const rect = el.getBoundingClientRect()
              if (!rect.width || rect.bottom < 0 || rect.top > innerHeight) continue
              const fs = parseFloat(getComputedStyle(el).fontSize)
              if (fs > 0 && fs < 16) out.push(`${fs}px "${n.textContent.trim().slice(0, 40)}" (${el.className || el.tagName})`)
            }
            return out
          })
          for (const t of r) if (!small.has(t)) small.set(t, where)
        }
        await scan('mapa')
        for (const i of [1, 2, 3, 4]) { await openPanel(page, profile, i); await scan(`aba ${i}`) }
        assert.deepEqual(Object.fromEntries(small), {}, 'textos menores que 16px')
        await ctx.close()
      })
    }

    test('editor: ajustar o contorno arrastando um vértice e salvar', async () => {
      const { ctx, page } = await open(profile)
      const farmName = P.farm
      const target = (await farms(page)).find(f => f.name.startsWith(farmName))
      assert.ok(target, `fazenda ${farmName} não encontrada`)
      if (!P.mobile) await openPanel(page, profile, 1)
      else { await page.locator('.map-search').click(); await page.waitForTimeout(600) }
      await page.locator('.property-card', { hasText: farmName }).locator('footer button').first().click()
      const canvas = page.locator('.picker-map canvas')
      await canvas.waitFor()
      await canvas.evaluate(e => e.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(2500)
      const box = await canvas.boundingBox()
      // O editor centraliza o mapa no contorno com zoom 14,3: projeta os vértices salvos para pixels
      // e o arrasta 30 px para fora do centro (a área precisa crescer).
      const world = 512 * 2 ** 14.3, merc = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
      const [clon, clat] = target.centroid
      const pts = target.geometry.coordinates[0].slice(0, -1).map(([lon, lat]) => [(lon - clon) * world / 360, -(merc(lat) - merc(clat)) * world / (2 * Math.PI)])
      // vértice dentro do mapa e longe da faixa de dica no rodapé do mapa
      const [dx, dy] = pts.filter(([x, y]) => Math.abs(x) < box.width / 2 - 20 && y > -box.height / 2 + 20 && y < box.height / 2 - 70).sort((a, b) => a[1] - b[1])[0]
      const len = Math.hypot(dx, dy)
      const x1 = box.x + box.width / 2 + dx, y1 = box.y + box.height / 2 + dy
      const x2 = x1 + 30 * dx / len, y2 = y1 + 30 * dy / len
      if (P.engine !== 'chromium' || !P.mobile) {
        await page.mouse.move(x1, y1); await page.mouse.down()
        for (let i = 1; i <= 10; i++) await page.mouse.move(x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10)
        await page.mouse.up()
      } else {
        const cdp = await ctx.newCDPSession(page)
        const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] })
        await touch('touchStart', x1, y1)
        for (let i = 1; i <= 10; i++) { await touch('touchMove', x1 + (x2 - x1) * i / 10, y1 + (y2 - y1) * i / 10); await page.waitForTimeout(20) }
        await touch('touchEnd')
      }
      await page.waitForTimeout(500)
      await shot(page, `${profile}-editor`)
      await page.locator('.farm-modal-footer button').last().click()
      await page.locator('.farm-modal').waitFor({ state: 'detached', timeout: 10000 })
      const saved = (await farms(page)).find(f => f.id === target.id)
      assert.ok(saved.area_ha > target.area_ha + 1, `área não mudou (${target.area_ha} → ${saved.area_ha})`)
      await ctx.close()
    })

    test('jornada de conta nova: cadastrar, criar fazenda, sair, entrar, idioma, exportar e excluir', async () => {
      const email = `e2e-${profile}-${Date.now()}@example.com`, password = 'TerraTurn-e2e-2026!'
      const { ctx, page, errors } = await open(profile, { path: '/register' })
      // 1. cadastro
      await page.locator('input[autocomplete="name"]').fill('Teste E2E')
      await page.locator('input[autocomplete="email"]').fill(email)
      await page.locator('input[autocomplete="new-password"]').fill(password)
      await page.locator('.check-label input[type="checkbox"]').check()
      await page.locator('form.auth-form button[type="submit"]').click()
      await page.waitForURL('**/app', { timeout: 15000 })
      await page.locator('.function-rail').waitFor()
      assert.equal((await farms(page)).length, 0, 'conta nova já tem fazendas')
      await shot(page, `${profile}-conta-vazia`)

      // 2. criar a primeira fazenda desenhando o contorno no mapa
      await page.locator('.empty-map-actions .btn-primary').click()
      await page.locator('.farm-modal').waitFor()
      await page.locator('.farm-modal input[maxlength="100"], .farm-modal input[placeholder^="E.g."]').first().fill('Fazenda E2E')
      const pick = async (label, text) => {
        const box = page.locator('.farm-modal .combobox-field', { hasText: label }).locator('input')
        await box.click(); await box.fill(text); await page.waitForTimeout(500); await page.keyboard.press('Enter'); await page.waitForTimeout(500)
      }
      await pick('State', 'Minas Gerais')
      await pick('Municipality', 'Uberaba')
      const canvas = page.locator('.picker-map canvas')
      await canvas.evaluate(e => e.scrollIntoView({ block: 'center' }))
      await page.waitForTimeout(2000)
      const b = await canvas.boundingBox(), cx = b.x + b.width / 2, cy = b.y + b.height / 2
      for (const [dx, dy] of [[-70, -60], [70, -60], [70, 60], [-70, 60]]) {
        if (P.mobile) await page.touchscreen.tap(cx + dx, cy + dy); else await page.mouse.click(cx + dx, cy + dy)
        await page.waitForTimeout(350)
      }
      await page.locator('.picker-actions .btn-primary').click()
      await shot(page, `${profile}-nova-fazenda`)
      await page.locator('.farm-modal-footer button').last().click()
      await page.locator('.farm-modal').waitFor({ state: 'detached', timeout: 15000 })
      let mine = await farms(page)
      assert.equal(mine.length, 1, 'fazenda não foi criada')
      assert.equal(mine[0].name, 'Fazenda E2E')
      assert.equal(mine[0].municipality, 'Uberaba')
      assert.ok(mine[0].area_ha > 1, 'área do contorno não registrada')
      // O app abre a análise da IA ao criar a primeira fazenda; o usuário fecha a janela.
      const sheet = page.locator('.ai-sheet')
      if (await sheet.count()) { await shot(page, `${profile}-analise-aberta`); await sheet.getByRole('button', { name: 'Close' }).click(); await sheet.waitFor({ state: 'detached' }) }

      // 3. sair e entrar de novo: a fazenda continua lá
      const settings = () => page.locator(P.mobile ? '.map-account' : '.rail-avatar').first().click()
      if (P.mobile) await openPanel(page, profile, 0)
      await settings()
      await page.locator('.workspace-dialog button', { hasText: /Sign out|Sair|Salir/ }).click()
      await page.waitForURL('**/login', { timeout: 15000 })
      await shot(page, `${profile}-depois-de-sair`)
      await page.locator('input[autocomplete="email"]').fill(email)
      await page.locator('input[autocomplete="current-password"]').fill(password)
      await page.locator('form.auth-form button[type="submit"]').click()
      await page.waitForURL('**/app', { timeout: 15000 })
      await page.locator('.function-rail').waitFor()
      mine = await farms(page)
      assert.equal(mine.length, 1, 'fazenda sumiu depois de entrar de novo')

      // 4. trocar o idioma para espanhol nas preferências
      if (P.mobile) await openPanel(page, profile, 0)
      await settings()
      await page.locator('.workspace-dialog .language-picker .select-trigger').click()
      await page.getByRole('option', { name: 'Español' }).click()
      await page.waitForTimeout(500)
      assert.ok(await page.locator('.workspace-dialog', { hasText: 'Exportar mis datos' }).isVisible(), 'idioma não mudou para espanhol')

      // 5. exportar os dados
      const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.workspace-dialog button', { hasText: 'Exportar mis datos' }).click()])
      const exported = JSON.parse(await (await download.createReadStream()).toArray().then(c => Buffer.concat(c).toString('utf8')))
      assert.equal(exported.user.email, email)
      assert.equal(exported.farms.length, 1)

      // 6. excluir a conta e confirmar que o login deixa de funcionar
      await page.locator('.workspace-dialog .text-action.danger').click()
      await page.locator('.account-delete input[type="password"]').fill(password)
      await page.locator('.account-delete .btn-danger').click()
      await page.waitForURL('**/login', { timeout: 15000 })
      await page.locator('input[autocomplete="email"]').fill(email)
      await page.locator('input[autocomplete="current-password"]').fill(password)
      await page.locator('form.auth-form button[type="submit"]').click()
      await page.locator('.form-error').waitFor()
      assert.ok(page.url().endsWith('/login'), 'conta excluída ainda entra')
      assert.deepEqual(errors, [], 'erros no console durante a jornada')
      await ctx.close()
    })
  })
}
