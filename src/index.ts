import { Pool } from 'pg'
import { BaseConnector, Reshuffle } from 'reshuffle-base-connector'

type Options = Record<string, any>

export type Query = (sql: string, params?: any[]) => Promise<any>

export type Sequence = (query: Query) => any

const URLRE = new RegExp( // postgresql://user:password@host/database
  '^postgres(ql)?:\\/\\/[^:]+(:[^@]+)?@' +
  '[0-9a-zA-Z_\\-]+(\\.[0-9a-zA-Z_\\-]+)*(:([0-9]+))?(\\/[0-9a-zA-Z_\\-]+)?$'
)
const MYSQL_PARAM = '?'

export class PgsqlConnector extends BaseConnector {
  private pool?: Pool

  constructor(app: Reshuffle, options: Options = {}, id?: string) {
    super(app, options, id)

    if (!URLRE.test(options.url)) {
      throw new Error(`Invalid database URL: ${options.url}`)
    }
    const ssl = options.ssl && Object.keys(options.ssl).length > 0 ? options.ssl : false

    this.pool = new Pool({ connectionString: options.url, ssl: ssl })
  }

  // Actions ////////////////////////////////////////////////////////

  public async close() {
    await this.pool!.end()
    this.pool = undefined
  }

  public async query(sql: string, params?: any[]) { 
    if (params) {
      sql = this.setParameterizedQuery(sql, params)
    }
    const res = await this.pool!.query(sql, params)
    return {
      fields: res.fields,
      rows: res.rows,
      rowCount: res.rowCount,
    }
  }

  private setParameterizedQuery(sql: string, params?: any[]): string {
    params?.forEach((param, index) => {
      sql = sql.indexOf(MYSQL_PARAM) ? sql.replace(MYSQL_PARAM, `\$${index + 1}`) : sql
    })
    return sql
  }

  public async sequence(seq: Sequence) {
    const conn = await this.pool!.connect()
    try {
      const ret = await seq(conn.query.bind(conn))
      return ret // must await for finally
    } finally {
      conn.release()
    }
  }

  public async transaction(seq: Sequence) {
    const conn = await this.pool!.connect()
    try {
      await conn.query('BEGIN')
      const ret = await seq(conn.query.bind(conn))
      await conn.query('COMMIT')
      return ret
    } catch (error) {
      await conn.query('ROLLBACK')
      throw error
    } finally {
      conn.release()
    }
  }
}
