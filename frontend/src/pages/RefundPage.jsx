import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Zap, ArrowLeft, RefreshCcw } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="font-heading font-bold text-xl md:text-2xl text-white uppercase tracking-tight mb-4">{title}</h2>
    <div className="text-zinc-400 text-sm md:text-base leading-relaxed space-y-3">{children}</div>
  </div>
);

export default function RefundPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO title="Refund Policy | Formanti" url="https://www.formanti.com/refund" />
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
          <RefreshCcw className="w-8 h-8 text-lime-400" />
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tighter">Refund Policy</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-12">Last updated: July 7, 2026</p>

        <Section title="1. Overview">
          <p>
            Formanti sells <strong className="text-white">digital tokens</strong> that are used to run AI video analyses and unlock paid features. Because tokens are a digital good that is delivered and consumed instantly, the following policy explains when refunds are and are not available. This policy is in addition to your rights under applicable law.
          </p>
        </Section>

        <Section title="2. Failed or Duplicate Payments">
          <p>
            If your payment was charged but tokens were <strong className="text-white">not credited</strong> to your account, or you were <strong className="text-white">charged more than once</strong> for the same order, you are entitled to a full refund of the affected amount. Contact us with your registered email and the payment reference, and we will investigate and refund verified cases.
          </p>
        </Section>

        <Section title="3. Unused Token Packs">
          <p>
            If you purchased a token pack and have <strong className="text-white">not used any tokens from it</strong>, you may request a refund within <strong className="text-white">7 days</strong> of purchase. The full unused pack will be refunded and the corresponding tokens removed from your account.
          </p>
        </Section>

        <Section title="4. Partially Used or Consumed Tokens">
          <p>
            Tokens that have already been <strong className="text-white">used to run an analysis or unlock a feature are non-refundable</strong>, as the digital service has already been delivered. If a pack has been partially used, only the value of the remaining unused tokens may be considered for a refund at our discretion within the 7-day window.
          </p>
        </Section>

        <Section title="5. Service Errors">
          <p>
            If an analysis fails due to a verified fault on our side (for example, the system accepted your upload and charged tokens but returned no result due to a technical error), the tokens for that analysis will be <strong className="text-white">re-credited to your account</strong>. Where tokens cannot be re-credited, an equivalent refund may be issued.
          </p>
        </Section>

        <Section title="6. How to Request a Refund">
          <p>Email <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a> from your registered email address with:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Your account email / registered phone number</li>
            <li>The order or payment reference ID</li>
            <li>The reason for the refund request</li>
          </ul>
        </Section>

        <Section title="7. Refund Timeline &amp; Method">
          <p>
            Approved refunds are processed to the <strong className="text-white">original payment method</strong> via our payment partner Razorpay. Once approved, refunds are typically initiated within <strong className="text-white">2–3 business days</strong> and may take <strong className="text-white">5–7 business days</strong> (occasionally longer, depending on your bank or card issuer) to reflect in your account.
          </p>
        </Section>

        <Section title="8. Contact">
          <p>
            Questions about a refund? Reach us at <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a>. See also our <Link to="/cancellation" className="text-lime-400 hover:text-lime-300">Cancellation Policy</Link> and <Link to="/terms" className="text-lime-400 hover:text-lime-300">Terms &amp; Conditions</Link>.
          </p>
          <p className="text-zinc-500 text-sm">
            Operated by <strong className="text-white">Harshit Mundra</strong> (individual / sole proprietor), Bengaluru, Karnataka, India.
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
