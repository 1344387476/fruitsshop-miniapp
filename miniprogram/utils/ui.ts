import { shop } from '../config/shop'
export type Tap = WechatMiniprogram.TouchEvent
export type Input = WechatMiniprogram.Input
export const errorToast = (error: unknown) =>
  wx.showToast({ title: error instanceof Error ? error.message : '操作失败，请重试', icon: 'none' })
export const success = (title: string) => wx.showToast({ title, icon: 'success' })
export const go = (url: string) => wx.navigateTo({ url })
export function contact() {
  if (shop.phone) wx.makePhoneCall({ phoneNumber: shop.phone })
  else
    wx.showModal({
      title: '联系店家',
      content: '门店电话尚未配置。正式使用前请在门店配置中填写联系电话。',
      showCancel: false,
    })
}
