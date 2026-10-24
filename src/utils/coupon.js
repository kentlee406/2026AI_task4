// 優惠碼規則集中於此；目前三組優惠碼直接寫在程式中，不提供後台管理
const COUPONS = Object.freeze({
  FLOWER100: Object.freeze({
    minSubtotal: 800,
    calculate: () => 100
  }),
  SPRING10: Object.freeze({
    minSubtotal: 0,
    calculate: subtotal => Math.min(Math.round(subtotal * 0.1), 300)
  }),
  SUMMER50: Object.freeze({
    expired: true,
    minSubtotal: 0,
    calculate: () => 50
  })
});

class CouponError extends TypeError {
  constructor(message) {
    super(message);
    this.name = 'CouponError';
  }
}

/**
 * 將輸入的優惠碼正規化為大寫；未提供（undefined、null、空白字串）回傳 null。
 */
function normalizeCouponCode(couponCode) {
  if (couponCode === undefined || couponCode === null) {
    return null;
  }

  if (typeof couponCode !== 'string') {
    throw new CouponError('couponCode 必須為字串');
  }

  const normalized = couponCode.trim().toUpperCase();
  return normalized === '' ? null : normalized;
}

/**
 * 依商品小計計算折扣。優惠只折抵商品小計，不折抵運費。
 * 無效、已失效或未達門檻時 throw CouponError。
 */
function applyCoupon({ subtotal, couponCode }) {
  const code = normalizeCouponCode(couponCode);

  if (code === null) {
    return Object.freeze({ code: null, discount: 0 });
  }

  const coupon = Object.prototype.hasOwnProperty.call(COUPONS, code) ? COUPONS[code] : null;

  if (!coupon) {
    throw new CouponError('優惠碼無效');
  }

  if (coupon.expired) {
    throw new CouponError('優惠碼已失效');
  }

  if (subtotal < coupon.minSubtotal) {
    throw new CouponError(`商品小計需滿 ${coupon.minSubtotal} 元才能使用此優惠碼`);
  }

  // 折扣不得超過商品小計
  const discount = Math.min(coupon.calculate(subtotal), subtotal);

  return Object.freeze({ code, discount });
}

module.exports = {
  CouponError,
  normalizeCouponCode,
  applyCoupon
};
