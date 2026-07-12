import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Zap, ArrowLeft, XCircle } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="font-heading font-bold text-xl md:text-2xl text-white uppercase tracking-tight mb-4">{title}</h2>
    <div className="text-zinc-400 text-sm md:text-base leading-relaxed space-y-3">{children}</div>
  </div>
);

export default function CancellationPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO title="Cancellation Policy | Formanti" url="https://www.formanti.com/cancellation" />
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
          <XCircle className="w-8 h-8 text-lime-400" />
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tighter">Cancellation Policy</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-12">Last updated: July 7, 2026</p>

        <Section title="1. Token Purchases">
          <p>
            Token packs on Formanti are <strong className="text-white">one-time purchases</strong>, not recurring subscriptions. There is no auto-renewal and nothing is charged to you on an ongoing basis. Because tokens are a digital good delivered instantly upon payment, an order <strong className="text-white">cannot be cancelled once the tokens have been credited</strong> to your account.
          </p>
        </Section>

        <Section title="2. Cancelling Before Completion">
          <p>
            You may cancel a purchase at any point <strong className="text-white">before completing payment</strong> simply by closing the payment window; no charge will be made. If a payment is interrupted and tokens are not credited, no amount will be captured, and any temporary authorisation will be released by your bank.
          </p>
        </Section>

        <Section title="3. Refunds After Purchase">
          <p>
            While a completed token order cannot be "cancelled", you may still be eligible for a refund of unused tokens or for failed/duplicate charges under our <Link to="/refund" className="text-lime-400 hover:text-lime-300">Refund Policy</Link>. Please refer to that policy for eligibility and timelines.
          </p>
        </Section>

        <Section title="4. Cancelling Your Account">
          <p>
            You may stop using Formanti and request deletion of your account at any time by emailing <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a> from your registered email. Upon account deletion, your personal data is removed as described in our <Link to="/privacy" className="text-lime-400 hover:text-lime-300">Privacy Policy</Link>. Any unused tokens remaining at the time of account deletion are forfeited unless a refund has been separately approved under the Refund Policy.
          </p>
        </Section>

        <Section title="5. Contact">
          <p>
            For help with a cancellation or account deletion, contact <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 font-medium">support@formanti.com</a>.
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
