'use strict'

const { test } = require('node:test')
const Fastify = require('fastify')
const cors = require('cors')

const middiePlugin = require('../index')

test('Should enhance the Node.js core request/response objects', async (t) => {
  t.plan(13)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(middiePlugin, { hook: 'preHandler' }).after(() => {
    fastify.use(cors())
  })

  fastify.post('/', async (req, reply) => {
    t.assert.strictEqual(req.raw.originalUrl, req.raw.url)
    t.assert.strictEqual(req.raw.id, req.id)
    t.assert.strictEqual(req.raw.hostname, req.hostname)
    t.assert.strictEqual(req.raw.protocol, req.protocol)
    t.assert.strictEqual(req.raw.ip, req.ip)
    t.assert.deepStrictEqual(req.raw.ips, req.ips)
    t.assert.deepStrictEqual(req.raw.body, req.body)
    t.assert.deepStrictEqual(req.raw.query, req.query)
    t.assert.ok(req.raw.body.bar)
    t.assert.ok(req.raw.query.foo)
    t.assert.ok(req.raw.log)
    t.assert.ok(reply.raw.log)
    return { hello: 'world' }
  })

  const fastifyServerAddress = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServerAddress}?foo=bar`, {
    method: 'POST',
    body: JSON.stringify({ bar: 'foo' }),
    headers: { 'Content-Type': 'application/json' }
  })
  t.assert.ok(result.ok)
})

test('Should not enhance the Node.js core request/response objects when there are no middlewares', async (t) => {
  t.plan(10)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(middiePlugin, { hook: 'preHandler' })

  fastify.post('/', async (req, reply) => {
    t.assert.strictEqual(req.raw.originalUrl, undefined)
    t.assert.strictEqual(req.raw.id, undefined)
    t.assert.strictEqual(req.raw.hostname, undefined)
    t.assert.strictEqual(req.raw.ip, undefined)
    t.assert.strictEqual(req.raw.ips, undefined)
    t.assert.deepStrictEqual(req.raw.body, undefined)
    t.assert.deepStrictEqual(req.raw.query, undefined)
    t.assert.ok(!req.raw.log)
    t.assert.ok(!reply.raw.log)
    return { hello: 'world' }
  })

  const fastifyServerAddress = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServerAddress}?foo=bar`, {
    method: 'POST',
    body: JSON.stringify({ bar: 'foo' }),
    headers: { 'Content-Type': 'application/json' }
  })
  t.assert.ok(result.ok)
})

test('If the enhanced response body is undefined, the body key should not exist', async (t) => {
  t.plan(2)
  const fastify = Fastify()
  t.after(() => fastify.close())

  fastify.register(middiePlugin).after(() => {
    fastify.use(cors())
    fastify.use((req, _res, next) => {
      t.assert.strictEqual('body' in req, false)
      next()
    })
  })

  const fastifyServerAddress = await fastify.listen({ port: 0 })

  const result = await fetch(`${fastifyServerAddress}?foo=bar`, {
    method: 'POST'
  })
  t.assert.ok(!result.ok)
})
