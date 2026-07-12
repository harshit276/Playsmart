import { Link } from "react-router-dom";
import SEO from "@/components/SEO";
import { Zap, ArrowLeft, Mail, Phone, MapPin, Clock } from "lucide-react";

// ── Business / operator contact details (shown publicly per Razorpay's
// "Contact Us" requirement: legal name, physical address, working email +
// phone, and business hours). EDIT THESE to your real, verifiable details —
// they should match your Razorpay KYC. ──────────────────────────────────────
const CONTACT = {
  operator: "Harshit Mundra",
  descriptor: "Individual / Sole Proprietor",
  email: "support@formanti.com",
  phone: "__PHONE__",               // e.g. "+91 98XXXXXXXX"
  address: "__FULL_ADDRESS__",       // full street/area, city, state, PIN
  hours: "Monday – Saturday, 10:00 AM – 7:00 PM IST",
};

const Row = ({ icon: Icon, label, children }) => (
  <div className="flex items-start gap-4 py-4 border-b border-zinc-800/50">
    <Icon className="w-5 h-5 text-lime-400 mt-0.5 shrink-0" />
    <div>
      <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">{label}</p>
      <div className="text-zinc-200 text-sm md:text-base">{children}</div>
    </div>
  </div>
);

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
      <SEO title="Contact Us | Formanti" url="https://www.formanti.com/contact" />
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
        <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tighter mb-2">Contact Us</h1>
        <p className="text-zinc-500 text-sm mb-10">
          We're here to help. Reach out and we'll get back to you as soon as we can.
        </p>

        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl px-6 md:px-8 py-4">
          <Row icon={MapPin} label="Operated By">
            <p className="text-white font-medium">{CONTACT.operator}</p>
            <p className="text-zinc-400 text-sm">{CONTACT.descriptor}</p>
          </Row>
          <Row icon={MapPin} label="Registered / Operating Address">
            {CONTACT.address}
          </Row>
          <Row icon={Mail} label="Email">
            <a href={`mailto:${CONTACT.email}`} className="text-lime-400 hover:text-lime-300">{CONTACT.email}</a>
          </Row>
          <Row icon={Phone} label="Phone">
            <a href={`tel:${CONTACT.phone.replace(/\s+/g, "")}`} className="text-lime-400 hover:text-lime-300">{CONTACT.phone}</a>
          </Row>
          <div className="flex items-start gap-4 py-4">
            <Clock className="w-5 h-5 text-lime-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-zinc-500 text-xs uppercase tracking-wider mb-1">Business Hours</p>
              <div className="text-zinc-200 text-sm md:text-base">{CONTACT.hours}</div>
            </div>
          </div>
        </div>

        <p className="text-zinc-500 text-sm mt-8">
          For questions about payments or refunds, please also see our{" "}
          <Link to="/refund" className="text-lime-400 hover:text-lime-300">Refund Policy</Link>,{" "}
          <Link to="/cancellation" className="text-lime-400 hover:text-lime-300">Cancellation Policy</Link>, and{" "}
          <Link to="/terms" className="text-lime-400 hover:text-lime-300">Terms &amp; Conditions</Link>.
        </p>

        {/* Back link */}
        <div className="pt-10 mt-8 border-t border-zinc-800/50">
          <Link to="/" className="inline-flex items-center gap-2 text-zinc-500 hover:text-lime-400 transition-colors text-sm">
            <ArrowLeft className="w-4 h-4" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
