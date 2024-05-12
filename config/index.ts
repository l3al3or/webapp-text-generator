import type { AppInfo } from '@/types/app'
export const APP_ID = `${process.env.NEXT_PUBLIC_APP_ID}`
export const API_KEY = `${process.env.NEXT_PUBLIC_APP_KEY}`
export const API_URL = `${process.env.NEXT_PUBLIC_API_URL}`
export const IS_WORKFLOW = `${process.env.NEXT_PUBLIC_APP_TYPE_WORKFLOW}` === 'true'
export const APP_INFO: AppInfo = {
  title: '<img src="${importImage()}" width="300" height="300" alt="DPASANAA APP"/>',
  description: 'หากมีข้อมูลส่วนไหนไม่ตรงรบกวนแจ้งมาที่ Line:@dpasanaa ได้เลยนะครับ',
  copyright: '',
  privacy_policy: '',
  default_language: 'en-US',
}

export const API_PREFIX = '/api'

export const LOCALE_COOKIE_NAME = 'locale'

export const DEFAULT_VALUE_MAX_LEN = 48
function importImage() {
  return 'https://www.dpasanaa.net/wp-content/uploads/2023/10/%E0%B8%9C%E0%B8%87%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A-%E0%B8%AD%E0%B8%AD%E0%B9%81%E0%B8%81%E0%B8%99%E0%B8%B4%E0%B8%84-%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A%E0%B8%8A%E0%B8%99%E0%B8%B4%E0%B8%94%E0%B8%9C%E0%B8%87-%E0%B8%9C%E0%B8%87%E0%B8%81%E0%B8%A5%E0%B9%89%E0%B8%A7%E0%B8%A2%E0%B8%94%E0%B8%B4%E0%B8%9A%E0%B8%9A%E0%B8%94-%E0%B8%A2%E0%B8%B2%E0%B9%81%E0%B8%81%E0%B9%89%E0%B8%81%E0%B8%A3%E0%B8%94%E0%B9%84%E0%B8%AB%E0%B8%A5%E0%B8%A2%E0%B9%89%E0%B8%AD%E0%B8%99.jpg';
}
