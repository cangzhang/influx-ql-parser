const QUTOE_MARK = '"'
const COMMA_MARK = ','
const PERIOD_MARK = '.'
const L_BRACKET = '('
const R_BRACKET = ')'
const CONDITION_AND = 'and'
const CONDITION_OR = 'or'
const KW_TIME = 'time'

const getStrBeforeComma = function (str) {
  const endsWithComma = /"([^"]+)",?$/.test(str)
  if (!endsWithComma)
    return ''

  let strWithinQuotes = str.match(/"([^"]+)",?/)[1]
  return strWithinQuotes
}

const extractStrWithinQuotes = function (str) {
  const hasQuote = str.indexOf('"') >= 0
  return hasQuote ? str.match(/"(.*?)"/)[1] : str
}

const removeSpacesWithQuotes = function (str) {
  return str.replace(/"([^"]+)"|'([^']+)'/g, function (m) {
    return m.replace(/\s/g, '')
  })
}

const getField = function (str) {
  let field = ''
  if (str.indexOf(QUTOE_MARK) >= 0) {
    field = getStrBeforeComma(str)
    return field
  }

  field = str.split(COMMA_MARK)[0]
  return field
}

const getFunc = function (str) {
  let func = str.split(L_BRACKET)[0].toUpperCase()
  return func || ''
}

const getFieldFromAggregateFuncStr = function (_str) {
  let raw = _str
  if (_str.indexOf(L_BRACKET) >= 0) {
    raw = _str.match(/\(+(.*?)\)+/)[1]
  }
  let field = getField(raw)
  return field
}

const validateGb = function (str) {
  return /time\(\d+[w|d|h|m|s]\)$/.test(str)
}

const extractGb = function (str) {
  return str.match(/\d+[w|d|h|m|s]/g)[0]
}

const includesKey = function (arr = [], key) {
  return [',', ...arr]
    .join(' ,')
    .toLowerCase()
    .indexOf(`,${key} ,`) >= 0
}

const isField = function (_field, fieldArr = []) {
  let field = extractStrWithinQuotes(_field)
  let result = fieldArr.filter(el => el[0].indexOf(field) >= 0)
  return result.length > 0
}

const getCondStr = function (str) {
  let f = extractStrWithinQuotes(str)
  return f.replace(/(')/g, '')
}


let sample = `
  SELECT last("usage_idle") AS "    last_usage,idle",
    mean("usage_user") AS "USER",
    ((usage_system)) as system
  FROM "telegraf".autogen."cpu" 
  WHERE "usage_idle" >    50 
      AND time > now() - 1h 
      AND "cpu"='cpu-total'
      OR 'host' = 124535
  GROUP BY time(10s)
  limit 30
  order by time desc
`

let _raw = sample.trim().replace(/\s+/g, ' ')
let raw = removeSpacesWithQuotes(_raw)

let srcArr = raw.split(' ')
let qArr = raw.toLowerCase().split(' ')

let query = {
  db: '',
  database: '',
  from: '',
  whereObj: {
    AND: [],
    OR: [],
    TAG: [],
  }
}

let start = qArr.indexOf('select')

if (start !== 0) {
  throw new Error(`Query must start with 'select/SELECT'.`)
}

let fromIdx = qArr.indexOf('from')

let selects = qArr.slice(1, fromIdx)
let origSelects = srcArr.slice(1, fromIdx)

// if (!selects.length) {
//   throw new Error(`No field(s) selected.`)
// }
// if (selects.length % 3 > 1) {
//   throw new Error(`Wrong fields input.`)
// }

let fieldArr = []
for (let idx = 0; idx < selects.length;) {
  if (selects[idx + 1] === 'as') {
    let field = origSelects.slice(idx, idx + 3)
    fieldArr.push(field)
    idx += 3
  } else {
    let field = origSelects[idx]
    field.length && fieldArr.push([field])
    idx++
  }
}

let fieldSet = []
fieldArr.map(function (fArr) {
  let len = fArr.length
  let field = '',
    as = '',
    func = ''

  if (len === 1) {
    let fStr = fArr[0]
    field = getField(fStr)
  } else if (len === 3) {
    func = getFunc(fArr[0])
    field = getFieldFromAggregateFuncStr(fArr[0])
    as = getField(fArr[2])
  }

  field && fieldSet.push({
    func,
    field,
    as,
  })

  return null
})

query.fieldSet = fieldSet

let fromStr = srcArr[fromIdx + 1]
let fromArr = fromStr.split('.')

if (fromArr.length !== 3) {
  throw new Error('Wrong from format.')
}

query.db = query.database = extractStrWithinQuotes(fromArr[0])
query.retentionPolicy = extractStrWithinQuotes(fromArr[1])
query.from = extractStrWithinQuotes(fromArr[2])

let groupBy = ''
let gbIdx = qArr.indexOf('group')
let gBStr = qArr[gbIdx + 2]
let isValidGb = validateGb(gBStr)

if (isValidGb) {
  groupBy = extractGb(gBStr)
}

groupBy && (query.groupBy = groupBy)

const simpleSelect = function (idx, gap, arr) {
  return idx >= 0 ? arr[idx + gap] : null
}

let sOfwhere = qArr.indexOf('where')
let limitIdx = qArr.indexOf('limit')
let slimitIdx = qArr.indexOf('slimit')
let offsetIdx = qArr.indexOf('offset')
let soffsetIdx = qArr.indexOf('soffset')
let orderIdx = qArr.indexOf('order')

query.limit = simpleSelect(limitIdx, 1, qArr)
query.slimit = simpleSelect(slimitIdx, 1, qArr)
query.offset = simpleSelect(offsetIdx, 1, qArr)
query.soffset = simpleSelect(soffsetIdx, 1, qArr)
query.orderBy = simpleSelect(orderIdx, 3, qArr)

let eOfWhere = [
  limitIdx,
  slimitIdx,
  offsetIdx,
  soffsetIdx,
  orderIdx,
  gbIdx,
]
  .filter(e => e > 0)
  .sort()[0]

let srcWhereArr = srcArr.slice(sOfwhere + 1, eOfWhere)
let whereArr = qArr.slice(sOfwhere + 1, eOfWhere)

let andArr = [],
  orArr = []

let breaks = whereArr
  .map(function (e, i) {
    if (e === CONDITION_AND || e === CONDITION_OR) {
      return i
    }
    return -1
  })
  .filter(e => e > 0)


andArr.push(srcWhereArr.slice(0, breaks[0]))

for (let i = 0; i < breaks.length; i++) {
  let lIdx = breaks[i]
  let rIdx = breaks[i + 1]
  let cond = whereArr[lIdx]
  let next = srcWhereArr.slice(lIdx + 1, rIdx)
  if (cond === CONDITION_AND) {
    andArr.push(next)
  } else {
    orArr.push(next)
  }
}

// ignore keyword *time*
let ands = andArr.filter(e =>
  !includesKey(e, KW_TIME) && e.length === 3)
let ors = orArr.filter(e =>
  !includesKey(e, KW_TIME) && e.length === 3)

ands.map(arr => {
  const isNotTag = isField(arr[0], fieldArr)
  let param1 = getCondStr(arr[0])
  let param2 = getCondStr(arr[2])

  if (isNotTag) {
    query.whereObj.AND.push({
      param1,
      param2,
      operator: arr[1],
    })
  } else {
    query.whereObj.TAG.push({
      tagKey: param1,
      tagValue: param2,
      operator: arr[1],
    })
  }
  return null
})

query.whereObj.OR = ors.map(arr => {
  let param1 = getCondStr(arr[0])
  let param2 = getCondStr(arr[2])

  return {
    operator: arr[1],
    param1,
    param2,
  }
})

console.log(query)
