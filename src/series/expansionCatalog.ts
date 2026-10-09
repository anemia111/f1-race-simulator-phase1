import catalogJson from '../data/expansionCatalog2026.json'
import { driverPool2026, seriesPackages } from './seriesRegistry'

export type CatalogEntry = {
  number: string
  team: string | null
  machine: string | null
  drivers: string[]
  sourceId: string
  tyreSupplier?: string | null
  engine?: string | null
}
export type CatalogEvent = {
  round: number
  trackName: string
  trackKey: string
  dateLabel: string
  sourceId: string
  raceName?: string
  url?: string
}
export type ExpansionCategory = {
  id: string
  label: string
  entries: CatalogEntry[]
}
type CatalogSource = { id: string; url: string; scope: string; verifiedOn: string; sha256: string }
type ExpansionCatalog = {
  schemaVersion: number
  season: number
  verifiedOn: string
  categories: ExpansionCategory[]
  sources: CatalogSource[]
  calendars: Record<string, CatalogEvent[]>
}
export const expansionCatalog = catalogJson as ExpansionCatalog
export const expansionSourceById = new Map(expansionCatalog.sources.map((source) => [source.id, source]))

function normaliseName(name: string) {
  return name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

// Reviewed bilingual identities, not fuzzy matching. A miss never silently
// merges two people or changes their existing, user-authored ability values.
const aliases: Record<string, string> = {
  '太田格之進': 'kakunoshin_ohta', '野尻智紀': 'tomoki_nojiri',
  '笹原右京': 'ukyo_sasahara', '牧野任祐': 'tadasuke_makino',
  '山下健太': 'kenta_yamashita', '小林可夢偉': 'kamui_kobayashi',
  '小林利徠斗': 'rikuto_kobayashi', '小出峻': 'syun_koide',
  '福住仁嶺': 'nirei_fukuzumi', 'ザックオサリバン': 'zak_osullivan',
  '松下信治': 'nobuharu_matsushita', '坪井翔': 'sho_tsuboi',
  'サッシャフェネストラズ': 'sacha_fenestraz', '阪口晴南': 'sena_sakaguchi',
  '大湯都史樹': 'toshiki_oyu', '野村勇斗': 'yuto_nomura',
  '佐藤蓮': 'ren_sato', 'イゴールオオムラフラガ': 'igor_fraga',
}
const poolIdsByName = new Map(driverPool2026.map((driver) => [normaliseName(driver.name), driver.id]))
for (const [alias, id] of Object.entries(aliases)) poolIdsByName.set(normaliseName(alias), id)

// Official entry-list forms and the supplied CSV use these reviewed variants.
// Never infer an identity from a shared surname or a similar ability score.
const reviewedCsvNames: Record<string, string> = {
  'Alexander Lynn': 'Alex Lynn', 'Luis Felipe Derani': 'Pipo Derani',
  'Philip Hanson': 'Phil Hanson', 'Igor Fraga': 'Igor Omura Fraga',
  'ジュリアーノアレジ': 'Giuliano Alesi', 'ベルトランバゲット': 'Bertrand Baguette',
  '三宅淳詞': 'Atsushi Miyake', '千代勝正': 'Katsumasa Chiyo',
  '名取鉄平': 'Teppei Natori', '国本雄資': 'Yuji Kunimoto',
  '塚越広大': 'Koudai Tsukakoshi', '大嶋和也': 'Kazuya Oshima',
  '大津弘樹': 'Hiroki Otsu', '大草りき': 'Riki Okusa',
  '山本尚貴': 'Naoki Yamamoto', '平峰一貴': 'Kazuki Hiramine',
  '関口雄飛': 'Yuhi Sekiguchi', '高星明誠': 'Mitsunori Takaboshi',
  'ジェームスプル': 'James Pull', 'ジョアオパオロデオリベイラ': 'João Paulo de Oliveira',
  'スヴェンミューラー': 'Sven Müller', 'ダニールクビアト': 'Daniil Kvyat',
  'チャーリーファグ': 'Charlie Fagg', 'チャーリーブルツ': 'Charlie Wurz',
  'ニクラスクルッテン': 'Niklas Krütten', 'リジョンウ': 'Lee Jungwoo',
  '久保凜太郎': 'Rintaro Kubo', '井口卓人': 'Takuto Iguchi', '井田太陽': 'Taiyo Ida',
  '伊東黎明': 'Reimei Ito', '元嶋佑弥': 'Yuya Motojima', '冨林勇佑': 'Yusuke Tomibayashi',
  '加納政樹': 'Masaki Kano', '卜部和久': 'Kazuhisa Urabe', '吉本大樹': 'Hiroki Yoshimoto',
  '吉田広樹': 'Hiroki Yoshida', '和田久': 'Hisashi Wada', '坂口夏月': 'Natsu Sakaguchi',
  '城内政樹': 'Masaki Jyonai', '堤優威': 'Yuui Tsutsumi', '塩津佑介': 'Yusuke Shiotsu',
  '大木一輝': 'Kazuki Oki', '安田裕信': 'Hironobu Yasuda', '富田竜一郎': 'Ryuichiro Tomita',
  '小山美姫': 'Miki Koyama', '小暮卓史': 'Takashi Kogure', '小林崇志': 'Takashi Kobayashi',
  '小高一斗': 'Kazuto Kotaka', '山内英輝': 'Hideki Yamauchi', '川合孝汰': 'Kohta Kawaai',
  '川端伸太朗': 'Shintaro Kawabata', '平中克幸': 'Katsuyuki Hiranaka',
  '平木湧也': 'Yuya Hiraki', '平木玲次': 'Reiji Hiraki', '平良響': 'Hibiki Taira',
  '新原光太郎': 'Kotaro Shimbara', '新田守男': 'Morio Nitta', '木村偉織': 'Iori Kimura',
  '松井孝允': 'Takamitsu Matsui', '松浦孝亮': 'Kosuke Matsuura', '梅垣清': 'Kiyoshi Umegaki',
  '永井宏明': 'Hiroaki Nagai', '河野駿佑': 'Shunsuke Kohno', '洞地遼大': 'Ryota Horachi',
  '清水英志郎': 'Eijiro Shimizu', '渡会太一': 'Taichi Watarai', '片山義章': 'Yoshiaki Katayama',
  '片岡龍也': 'Tatsuya Kataoka', '田中篤': 'Atsushi Tanaka', '石浦宏明': 'Hiroaki Ishiura',
  '篠原拓朗': 'Takuro Shinohara', '織戸学': 'Manabu Orido', '荒尾創大': 'Souta Arao',
  '荒川麟': 'Rin Arakawa', '菅波冬悟': 'Togo Suganami', '蒲生尚弥': 'Naoya Gamou',
  '藤井誠暢': 'Tomonobu Fujii', '藤原優太': 'Yuta Fujiwara', '藤原大輝': 'Daiki Fujiwara',
  '藤波清斗': 'Kiyoto Fujinami', '谷口信輝': 'Nobuteru Taniguchi', '野中誠太': 'Seita Nonaka',
  '金丸ユウ': 'Yu Kanamaru', '鈴木斗輝哉': 'Tokiya Suzuki', '高木真一': 'Shinichi Takagi',
}
for (const [alias, name] of Object.entries(reviewedCsvNames)) {
  const id = poolIdsByName.get(normaliseName(name))
  if (id) poolIdsByName.set(normaliseName(alias), id)
}

export const catalogPoolDriverById = new Map(driverPool2026.map((driver) => [driver.id, driver]))

export function catalogDriverId(name: string): string {
  const key = normaliseName(name)
  return poolIdsByName.get(key) ?? `catalog:${key}`
}

export const catalogDriverCategories = new Map<string, Set<string>>()
for (const series of seriesPackages) {
  for (const driver of series.drivers) {
    const categories = catalogDriverCategories.get(driver.id) ?? new Set<string>()
    categories.add(series.label)
    catalogDriverCategories.set(driver.id, categories)
  }
}
for (const category of expansionCatalog.categories) {
  for (const entry of category.entries) {
    for (const name of entry.drivers) {
      const id = catalogDriverId(name)
      const categories = catalogDriverCategories.get(id) ?? new Set<string>()
      categories.add(category.label)
      catalogDriverCategories.set(id, categories)
    }
  }
}

export function catalogCalendarFor(categoryId: string) {
  return expansionCatalog.calendars[categoryId.startsWith('super-gt-') ? 'super-gt' :
    categoryId.startsWith('wec-') ? 'wec' : categoryId] ?? []
}

export function validateExpansionCatalog(catalog: ExpansionCatalog): void {
  const sourceIds = new Set(catalog.sources.map((source) => source.id))
  if (catalog.schemaVersion !== 1 || catalog.season !== 2026 || sourceIds.size !== catalog.sources.length) {
    throw new Error('Invalid expansion catalog header or duplicate source')
  }
  const categories = new Set<string>()
  for (const category of catalog.categories) {
    if (categories.has(category.id) || !category.entries.length) throw new Error('Invalid expansion category')
    categories.add(category.id)
    const identities = new Set<string>()
    for (const entry of category.entries) {
      // INDYCAR directory contains multiple people sharing a number across
      // the season. They must not be treated as simultaneous duplicate cars.
      const identity = `${entry.number}:${entry.drivers.join('|')}`
      if (!/^\d{1,3}$/.test(entry.number) || !entry.drivers.length || identities.has(identity) ||
        entry.drivers.some((name) => !name.trim()) || !sourceIds.has(entry.sourceId)) {
        throw new Error(`Invalid expansion entry: ${category.id} ${entry.number}`)
      }
      identities.add(identity)
    }
  }
  for (const events of Object.values(catalog.calendars)) {
    const rounds = new Set<number>()
    for (const event of events) {
      if (rounds.has(event.round) || !event.trackKey || !event.trackName || !sourceIds.has(event.sourceId)) {
        throw new Error('Invalid expansion calendar')
      }
      rounds.add(event.round)
    }
  }
}
validateExpansionCatalog(expansionCatalog)
