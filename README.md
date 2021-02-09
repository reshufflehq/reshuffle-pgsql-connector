# reshuffle-pgsql-connector

[Code](https://github.com/reshufflehq/reshuffle-pgsql-connector) |
[npm](https://www.npmjs.com/package/reshuffle-pgsql-connector) |
[Code sample](https://github.com/reshufflehq/reshuffle-pgsql-connector/tree/master/examples)

`npm install reshuffle-pgsql-connector`

### Reshuffle Postgres SQL Connector

This package contains a [Reshuffle](https://github.com/reshufflehq/reshuffle)
connector to Postgres SQL databases.

The following example lists all information from the "users" table:

```js
const { Reshuffle } = require('reshuffle')
const { PgsqlConnector } = require('reshuffle-pgsql-connector')

;(async () => {
  const app = new Reshuffle()
  const pg = new PgsqlConnector(app, { url: process.env.POSTGRES_URL })

  const res = await pg.query(`SELECT * FROM users`)
  console.log(res)

  await pg.close()
})().catch(console.error)
```

#### Table of Contents

[Configuration](#configuration) Configuration options

_Connector actions_:

[close](#close) Close all active connections

[query](#query) Run a single query on the database

[sequence](#sequence) Run a series of queries on the databse

[transaction](#transaction) Run a transaction on the databae

##### <a name="configuration"></a>Configuration options

```js
const app = new Reshuffle();
const pg = new PgsqlConnector(app, {
  url: "postgres://user[:password]@hostname[:port]/database",
  //Only include ssl option when connecting to a database protected by ssl
  ssl: {
    rejectUnauthorized: false,
    // Configure any of the relevant options below to your own ssl details
    ca: fs.readFileSync("/path/to/server-certificates/root.crt").toString(),
    key: fs.readFileSync("/path/to/client-key/postgresql.key").toString(),
    cert: fs
      .readFileSync("/path/to/client-certificates/postgresql.crt")
      .toString(),
  },
});
```

If connecting to a local database, `ssl` option is not needed and can be left blank.

For more information check the [ssl](https://node-postgres.com/features/ssl) and [TLSSocket](https://nodejs.org/api/tls.html#tls_tls_createsecurecontext_options) documentation.

#### Connector actions

##### <a name="close"></a>Close action

_Definition:_

```ts
() => void
```

_Usage:_

```js
await pg.close()
```

Close all connections to the database. If an application terminates without
calling close, it might hang for a few seconds until active connections
time out.

##### <a name="query"></a>Query action

_Definition:_

```ts
(
  sql: string,
  params?: any[],
) => {
  fields: { name: string }[],
  rows: any[],
  rowCount: number,
}
```

_Usage:_

```js
await pg.query("INSERT INTO users VALUES ('John', 'Coltrane', 42)")

const family = await pg.query(
  "SELECT firstName, lastName, age FROM users WHERE lastName='Coltrane'"
)
// {
//   rowCount: 2,
//   fields: [{ name: 'firstName' }, { name: 'lastName' }, { name: 'age' }],
//   rows: [
//     { firstName: 'Alice', lastName: 'Coltrane', age: 31 },
//     { firstName: 'John', lastName: 'Coltrane', age: 42 },
//   ],
// }

const avgResponse = await pg.query(
  "SELECT average(age) AS avg FROM users WHERE lastName='Coltrane'"
)
const averageAge = avgResponse.rows[0].avg
// 36.5
```

The `query` action can be used to run _any_ SQL command on the connected
database (not just `SELECT`). The query is defined in the `sql` string. The
optional `params` can be used to generate parameterized queries, as shown in
the following example:

```js
const age = await pg.query(
  "SELECT age FROM users WHERE firstName=$1 and lastName=$2",
  ['John', 'Smith']
)
```

This action returns an object with the results of the query, where
`fields` is an array of all field names, as returned by the query.
Field names in a `SELECT` query are column names, or are specified
with an `AS` clause.  Every element of `rows` is uses the names in
`fields` as its object keys.

Note that every call to `query` may use a different database connection.
You can use the [sequence](#sequence) or [transaction](#transaction) actions
if such a guarantee is required.

##### <a name="sequence"></a>Sequence action

_Definition:_
```js
(
  seq: (query) => any,
) => any
```

_Usage:_

```js
const res = await pg.sequence(async (query) => {
  await query("INSERT INTO users VALUES ('Miles', 'Davis', 43)")
  return query("SELECT COUNT(*) FROM users")
})
const userCount = res.rows[0].count
// 3
```

Use `sequence` to perform multiple queries on the same database connection.
This action receives a `seq` function that may issue queries to the database,
all of which are guaranteed to run through the same connection. `seq` gets
one argument, which is a `query` function that can be used the same way as
the [query](#query) action. `seq` may, of course, use any JavaScript code to
implement its logic, log to the console etc.

Note that while `sequence` uses the same connection to run all queries, it
does not offer the transactional guarantees offered by
[transaction](#transaction). You can use it for weak isolation models, or
construct transactions directly without using `transaction`.

##### <a name="transaction"></a>Transaction action

_Definition:_
```js
(
  seq: (query) => any,
) => any
```

_Usage:_

```js
await pg.transaction(async (query) => {
  const res = await query("SELECT COUNT(*) FROM users")
  const userCount = res.rows[0].count
  if (100 <= userCount) {
    throw new Error('Too many users:', userCount)
  }
  return query("INSERT INTO users VALUES ('Charlie', 'Parker', 49)")
})
```

Use `transaction` to run multiple queries as an atomic SQL transaction.
The interface is identical to the [sequence action](#sequence), but all
the queries issued `seq` either success or fail together. If any of the
queries fail, all queries are rolled back and an error is thrown.

Consider, for example, the following code for updating a bank account
balance:

```js
const accountId = 289
const change = +1000
pg.transaction(async (query) => {
  await query(`
    UPDATE accounts
      SET balance = balance + $1
      WHERE account_id = $2
    `,
    [change, accountId],
  )
  await query(`
    INSERT INTO accounts_log(account_id, change, time)
      VALUES ($1, $2, current_timestamp)
    `,
    [change, accountId],
  )
})
```

In the example above, `accounts` holds current balances of accounts,
while `accounts_log` holds a history of all changes made. Using `transaction`
ensures that both tables are always updated together.
