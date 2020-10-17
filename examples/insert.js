const crypto = require('crypto')
const { Reshuffle } = require('reshuffle')
const { PgsqlConnector } = require('reshuffle-pgsql-connector')

async function main() {
  const app = new Reshuffle()
  const pg = new PgsqlConnector(app, { url: process.env.POSTGRES_URL })

  // Create table
  const tb = 't' + crypto.randomBytes(4).toString('hex')
  await pg.query(`CREATE TABLE ${tb} (name VARCHAR(10), color VARCHAR(10))`)

  // Text query
  await pg.query(`INSERT INTO ${tb} VALUES ('Lancelot', 'Blue')`)

  // Parametrized query
  await pg.query(`INSERT INTO ${tb} VALUES ($1, $2)`, ['Galahad', 'Yellow'])

  // Print rows
  const res = await pg.query(`SELECT * FROM ${tb}`)
  console.log(res)

  // Cleanup
  await pg.query(`DROP TABLE ${tb}`)
  await pg.close()
}

main().catch(console.error)
