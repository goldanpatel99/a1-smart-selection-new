/**
 * Razorpay Integration Service
 * Read keys only from server order response or import.meta.env.VITE_RAZORPAY_KEY_ID.
 * Strictly zero hardcoded keys or secrets.
 */

import { auth } from '../firebase';

declare global {
  interface Window {
    Razorpay: any;
  }
}

export interface RazorpayOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
}

export interface PaymentVerificationResponse {
  success: boolean;
  message?: string;
  error?: string;
  paymentId?: string;
}

export const razorpayService = {
  /**
   * Ensure Razorpay checkout script is loaded
   */
  async loadScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (window.Razorpay) return true;

    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  /**
   * Create order via backend API (server/Netlify function) with Firebase ID token
   */
  async createOrder(params: {
    amountRupees: number;
    points: number;
    packageId: string;
    userId: string;
    userEmail: string;
    studioName?: string;
  }): Promise<RazorpayOrderResponse | null> {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (res.ok) {
        return await res.json();
      }
      const errData = await res.json().catch(() => ({}));
      console.warn('Backend /api/create-order returned error:', errData);
      return null;
    } catch (err) {
      console.warn('Network issue reaching /api/create-order:', err);
      return null;
    }
  },

  /**
   * Verify cryptographic payment signature via server API
   */
  async verifyPayment(params: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    points?: number;
    packageId?: string;
    tier?: string;
  }): Promise<PaymentVerificationResponse> {
    try {
      const token = await auth.currentUser?.getIdToken().catch(() => null);
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch('/api/verify-payment', {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
      });

      if (res.ok) {
        return await res.json();
      }
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err?.error || `Verification endpoint returned ${res.status}` };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Verification network failure' };
    }
  },

  /**
   * Start 1-Click Razorpay Payment Checkout
   */
  async startCheckout(options: {
    amountRupees: number;
    points: number;
    packageName: string;
    packageId: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone: string;
    studioName?: string;
    onSuccess: (paymentId: string, orderId: string) => void;
    onError: (errorMessage: string) => void;
  }) {
    const isLoaded = await this.loadScript();
    if (!isLoaded || !window.Razorpay) {
      options.onError('Failed to load Razorpay payment gateway SDK. Please check your internet connection.');
      return;
    }

    try {
      // 1. Attempt to create order on server
      const order = await this.createOrder({
        amountRupees: options.amountRupees,
        points: options.points,
        packageId: options.packageId,
        userId: options.userId,
        userEmail: options.userEmail,
        studioName: options.studioName,
      });

      const envKey = (import.meta.env.VITE_RAZORPAY_KEY_ID as string) || '';
      const activeKey = order?.keyId || envKey;

      if (!activeKey) {
        options.onError('Razorpay Key ID is not configured. Please set RAZORPAY_KEY_ID in your environment variables.');
        return;
      }

      const activeAmount = order?.amount || Math.round(options.amountRupees * 100);
      const activeCurrency = order?.currency || 'INR';

      // 2. Configure Razorpay modal
      const rzpOptions: any = {
        key: activeKey,
        amount: activeAmount,
        currency: activeCurrency,
        name: options.studioName || 'NEPOLIAN CINEMATIC STUDIO',
        description: `${options.packageName} (${options.points} Event Credits)`,
        prefill: {
          name: options.userName,
          email: options.userEmail,
          contact: (options.userPhone || '').replace(/[^0-9]/g, '').slice(-10),
        },
        notes: {
          packageId: options.packageId,
          points: String(options.points),
          userId: options.userId,
          studioName: options.studioName || '',
        },
        theme: {
          color: '#f59e0b', // Amber-500 matching studio theme
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id?: string;
          razorpay_signature?: string;
        }) => {
          const paymentId = response.razorpay_payment_id;
          const orderId = response.razorpay_order_id || order?.orderId || `ord_${Date.now()}`;

          // Verify signature on server if signature provided
          if (response.razorpay_signature) {
            const verification = await this.verifyPayment({
              razorpay_order_id: orderId,
              razorpay_payment_id: paymentId,
              razorpay_signature: response.razorpay_signature,
              points: options.points,
              packageId: options.packageId,
            });

            if (!verification.success) {
              console.warn('Payment verification issue:', verification.error);
              options.onError(verification.error || 'Payment verification failed.');
              return;
            }
          }

          options.onSuccess(paymentId, orderId);
        },
        modal: {
          ondismiss: () => {
            options.onError('Payment window was closed by the user.');
          },
          escape: true,
          backdropclose: false,
        },
      };

      if (order?.orderId) {
        rzpOptions.order_id = order.orderId;
      }

      const rzp = new window.Razorpay(rzpOptions);

      rzp.on('payment.failed', (resp: any) => {
        const desc = resp.error?.description || resp.error?.reason || 'Transaction could not be completed.';
        options.onError(`Payment Failed: ${desc}`);
      });

      rzp.open();
    } catch (err: any) {
      console.error('Razorpay Checkout error:', err);
      options.onError(err?.message || 'Failed to initiate payment gateway.');
    }
  },
};
