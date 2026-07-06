import { Link } from "react-router-dom";
import { Zap, ArrowLeft, Shield } from "lucide-react";

const Section = ({ title, children }) => (
  <div className="mb-10">
    <h2 className="font-heading font-bold text-xl md:text-2xl text-white uppercase tracking-tight mb-4">{title}</h2>
    <div className="text-zinc-400 text-sm md:text-base leading-relaxed space-y-3">{children}</div>
  </div>
);

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-zinc-950">
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
          <Shield className="w-8 h-8 text-lime-400" />
          <h1 className="font-heading font-black text-3xl md:text-4xl text-white uppercase tracking-tighter">Privacy Policy</h1>
        </div>
        <p className="text-zinc-500 text-sm mb-12">Last updated: July 7, 2026</p>

        <Section title="1. Introduction">
          <p>
            Formanti ("we", "our", "us") is an AI-powered sports coaching platform operated by <strong className="text-white">Harshit Mundra</strong>, an individual / sole proprietor based in Bengaluru, Karnataka, India. We are committed to protecting your privacy and being transparent about how we handle your data. This policy explains what information we collect, how we use it, and your rights.
          </p>
        </Section>

        <Section title="2. Information We Collect">
          <p><strong className="text-white">Account Information:</strong> When you sign up, we collect your phone number (for OTP login) and/or your email address and basic profile details from Google Sign-In, depending on how you choose to authenticate. You may also provide your name, age, and sport preferences during the assessment process.</p>
          <p><strong className="text-white">Sport & Profile Data:</strong> Your selected sports, skill level, playing style, goals, equipment preferences, and any assessment responses you provide.</p>
          <p><strong className="text-white">Video Content:</strong> The sports videos you upload for analysis (see the section below on how these are processed and retained).</p>
          <p><strong className="text-white">Analysis Results:</strong> When you use our AI analysis features, the results (technique scores, feedback, improvement suggestions) are stored to track your progress over time.</p>
          <p><strong className="text-white">Payment Data:</strong> When you buy tokens, payment is processed by Razorpay. We receive confirmation of the transaction (amount, order/payment reference, status) but we do <strong className="text-white">not</strong> collect or store your full card, UPI, or bank details on our servers.</p>
          <p><strong className="text-white">Usage Data:</strong> We collect anonymized usage analytics to improve our platform (see Analytics section below).</p>
        </Section>

        <Section title="3. How Your Videos Are Processed & Retained">
          <p>
            When you submit a video for analysis, it is uploaded over an encrypted (HTTPS) connection to our processing pipeline. Where your device supports it, the video is first <strong className="text-white">compressed on your device</strong> before upload to reduce its size and your data usage.
          </p>
          <p>
            We use <strong className="text-white">Cloudinary</strong> as a temporary staging host to receive the upload, and <strong className="text-white">Google's Gemini API</strong> to perform the AI analysis. The temporary Cloudinary copy is deleted immediately after the video is handed to the analysis service. Videos held by Google's Gemini Files API are retained only transiently and are automatically deleted by Google (typically within about 48 hours).
          </p>
          <p>
            <strong className="text-lime-400">We do not permanently store your raw video files.</strong> After processing, only the analysis results you save (scores, detected movements, feedback) are retained on our servers so you can track your progress. Please only upload videos you have the right to share, and avoid uploading footage of other people without their consent.
          </p>
        </Section>

        <Section title="4. How We Use Your Data">
          <p>We use the information we collect to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Provide personalized training plans and recommendations</li>
            <li>Suggest equipment based on your playing style and preferences</li>
            <li>Track your progress and improvement over time</li>
            <li>Generate highlight reels from your analysis sessions</li>
            <li>Improve our AI models and platform features</li>
            <li>Send important service updates (not marketing)</li>
          </ul>
        </Section>

        <Section title="5. Analytics">
          <p>
            We use <strong className="text-white">Umami Analytics</strong>, a privacy-friendly, cookie-free analytics tool, for understanding how users interact with our platform. Umami does not collect personal data, does not use cookies, and complies with GDPR, CCPA, and PECR.
          </p>
          <p>
            We also use <strong className="text-white">PostHog</strong> for product analytics to understand feature usage and improve the user experience. PostHog data is anonymized and used solely for product improvement.
          </p>
        </Section>

        <Section title="6. Third-Party Services">
          <p>We use the following third-party services to operate our platform:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-white">Firebase (Google)</strong> - Authentication (phone OTP and Google Sign-In)</li>
            <li><strong className="text-white">Google Gemini API</strong> - AI analysis of uploaded videos</li>
            <li><strong className="text-white">Cloudinary</strong> - Temporary staging of uploaded videos during processing</li>
            <li><strong className="text-white">MongoDB Atlas</strong> - Data storage for user profiles, analysis results, and training data</li>
            <li><strong className="text-white">Vercel</strong> - Website and backend hosting infrastructure</li>
            <li><strong className="text-white">Razorpay</strong> - Payment processing for token purchases</li>
            <li><strong className="text-white">Umami &amp; PostHog</strong> - Privacy-friendly, anonymized product analytics</li>
          </ul>
          <p>Each of these services has their own privacy policies and we encourage you to review them.</p>
        </Section>

        <Section title="7. Data Retention">
          <p>
            We retain your data for as long as your account is active. If you delete your account, all your personal data (profile, analysis results, progress history) will be permanently deleted within 30 days. Anonymized analytics data may be retained for product improvement purposes.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>You have the right to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-white">Access your data</strong> - View all data we store about you through your profile and progress pages</li>
            <li><strong className="text-white">Export your data</strong> - Request a copy of all your data in a portable format</li>
            <li><strong className="text-white">Delete your account</strong> - Permanently delete your account and all associated data</li>
            <li><strong className="text-white">Correct your data</strong> - Update or correct any inaccurate information in your profile</li>
          </ul>
        </Section>

        <Section title="9. Data Security">
          <p>
            We implement industry-standard security measures to protect your data, including encrypted communications (HTTPS/TLS), secure authentication tokens, and access controls on our databases. Video uploads are transmitted over encrypted connections, are handled only for the purpose of generating your analysis, and are not retained as raw files after processing.
          </p>
        </Section>

        <Section title="10. Children's Privacy">
          <p>
            Formanti is intended for users of all ages who participate in sports. If you are under 13, please use our platform with parental guidance. We do not knowingly collect data from children under 13 without parental consent.
          </p>
        </Section>

        <Section title="11. Changes to This Policy">
          <p>
            We may update this privacy policy from time to time. We will notify users of any significant changes through the app. Continued use of Formanti after changes constitutes acceptance of the updated policy.
          </p>
        </Section>

        <Section title="12. Contact & Grievances">
          <p>
            If you have questions, requests, or complaints about this privacy policy or your data, you can contact our grievance contact:
          </p>
          <p className="text-zinc-300">
            <strong className="text-white">Harshit Mundra</strong><br />
            Bengaluru, Karnataka, India<br />
            <a href="mailto:support@formanti.com" className="text-lime-400 hover:text-lime-300 transition-colors font-medium">support@formanti.com</a>
          </p>
          <p>
            We aim to acknowledge and address grievances within a reasonable timeframe in accordance with applicable law. See also our <a href="/terms" className="text-lime-400 hover:text-lime-300">Terms &amp; Conditions</a>, <a href="/refund" className="text-lime-400 hover:text-lime-300">Refund Policy</a>, and <a href="/cancellation" className="text-lime-400 hover:text-lime-300">Cancellation Policy</a>.
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
