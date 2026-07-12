import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Zap, ArrowLeft, Truck } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="font-heading font-bold text-xl md:text-2xl text-white uppercase tracking-tight mb-4">{title}</h2>
    <div className="text-zinc-400 text-sm md:text-base leading-relaxed space-y-3">{children}</div>
  </div>
);

export default function ShippingPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO title="Shipping & Delivery Policy | Formanti" url="https://www.formanti.com/shipping" />
      {/* Header */}
      <div className="border-b border-zinc-800/50">
        <div className="container mx-auto px-4 max-w-4xl py-6 flex items-center gap-4">
          <Link to="/" className="flex items-center gap-2 text-zinc-400 hover:text-lime-400 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            <Zap className="w-5 h-5 text-lime-400" />
            <span className="font-heading font-bold text-lg uppercase tracking-tight text-white">Formanti</span>
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="container mx-auto px-4 max-w-4xl py-12 md:py-16">
        <div className="flex items-center gap-3 mb-2">
          <Truck className="w-8 h-8 text-lime-400" />
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tighter">Shipping &amp; Delivery Policy</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-12">Last updated: July 7, 2026</p>

        <Section title="1. Digital Products — No Physical Shipping">
          <p>
            Formanti is a fully <strong className="text-white">digital service</strong>. We do not sell, ship, or deliver any physical goods. The only items you purchase from us are <strong className="text-white">digital tokens</strong>, which are used within the Formanti web and mobile application to run AI video analyses and unlock features. Accordingly, no shipping, courier, or physical delivery is involved, and no shipping charges apply.
          </p>
        </Section>

        <Section title="2. Delivery of Tokens">
          <p>
            Tokens are delivered <strong className="text-white">electronically and instantly</strong>. As soon as your payment is successfully confirmed by our payment partner (Razorpay), the purchased tokens are credited to your Formanti account — typically within a few seconds and in any case within <strong className="text-white">24 hours</strong>.
          </p>
          <p>
            You can view your token balance at any time in your account wallet after logging in. There is no physical or emailed shipment; the tokens simply appear in your account.
          </p>
        </Section>

        <Section title="3. If Tokens Are Not Delivered">
          <p>
            In the rare event that your payment succeeds but tokens are not credited within 24 hours, please contact us at <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a> with your registered email and the payment reference. We will credit the tokens or, where applicable, issue a refund as described in our <Link to="/refund" className="text-lime-400 hover:text-lime-300">Refund Policy</Link>.
          </p>
        </Section>

        <Section title="4. Equipment Recommendations">
          <p>
            Formanti may recommend sports equipment and link to third-party retailers (such as e-commerce marketplaces). Any such purchase is made <strong className="text-white">directly with that third-party retailer</strong>, on their website and under their shipping, delivery, and return terms. Formanti does not sell, stock, ship, or deliver those products and is not responsible for their fulfilment.
          </p>
        </Section>

        <Section title="5. Contact">
          <p>
            Questions about delivery of your tokens? Reach us at <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a> or via our <Link to="/contact" className="text-lime-400 hover:text-lime-300">Contact Us</Link> page.
          </p>
        </Section>

        {/* Back link */}
        <div className="pt-8 border-t border-zinc-800/50">
          <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-lime-400 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
