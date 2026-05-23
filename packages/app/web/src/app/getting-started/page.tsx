'use client';

import { Code, Terminal, MonitorPlay, FlaskConical } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { CodeBlock } from '@/components/CodeBlock';
import Link from 'next/link';

const steps = [
  {
    icon: Code,
    title: 'Add the Recorder Script',
    description: 'Add the following script tag to your application\'s HTML to start recording user sessions:',
    code: `<script src="http://localhost:3001/recorder.js"></script>
<script>
  TakaRecorder.init({
    apiEndpoint: 'http://localhost:3001/api',
    uploadInterval: 5000,
    maxBatchSize: 100
  });
</script>`,
    tip: 'Place this script as early as possible in your HTML head to capture all events.',
  },
  {
    icon: Terminal,
    title: 'Start the Services',
    description: 'Make sure both the API server and web dashboard are running:',
    code: `# Start the API server
cd packages/app/api
npm run dev  # Runs on http://localhost:3001

# Start the web dashboard
cd packages/app/web
npm run dev  # Runs on http://localhost:3000`,
  },
  {
    icon: MonitorPlay,
    title: 'Record User Sessions',
    description: 'Use your application normally. The recorder will automatically capture:',
    list: [
      'Clicks, inputs, and scrolls',
      'Network requests and responses',
      'Page navigation',
      'Form submissions',
      'Storage changes (localStorage, cookies)',
    ],
    note: 'Sessions will appear in the dashboard automatically as users interact with your app.',
  },
  {
    icon: FlaskConical,
    title: 'Run Visual Tests',
    description: 'Replay sessions as automated tests and detect visual differences:',
    cards: [
      { title: 'Single Session Test', text: 'Click "Replay" on any session to run it as a test with screenshot capture.', bg: 'bg-green-50', titleColor: 'text-green-800', textColor: 'text-green-700' },
      { title: 'Visual Comparison', text: 'Compare screenshots between different sessions to detect visual regressions.', bg: 'bg-purple-50', titleColor: 'text-purple-800', textColor: 'text-purple-700' },
    ],
  },
];

const configOptions = [
  { option: 'apiEndpoint', default: 'http://localhost:3000/api', description: 'API server URL' },
  { option: 'uploadInterval', default: '5000', description: 'Upload frequency in milliseconds' },
  { option: 'maxBatchSize', default: '100', description: 'Maximum events per upload' },
  { option: 'enableNetworkCapture', default: 'true', description: 'Record network requests' },
  { option: 'enableStorageCapture', default: 'true', description: 'Monitor storage changes' },
];

export default function GettingStartedPage() {
  return (
    <div className="max-w-4xl space-y-8">
      <PageHeader
        title="Getting Started"
        description="Get up and running with Taka in minutes"
      />

      <div className="space-y-6">
        {steps.map((step, i) => (
          <div key={i} className="card p-6">
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-10 h-10 bg-primary-50 text-primary-600 rounded-lg flex items-center justify-center">
                <step.icon className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                <p className="text-gray-600 mb-4">{step.description}</p>

                {step.code && <CodeBlock>{step.code}</CodeBlock>}

                {step.tip && (
                  <p className="text-sm text-gray-500 mt-3">
                    Tip: {step.tip}
                  </p>
                )}

                {step.list && (
                  <ul className="list-disc list-inside space-y-1 text-gray-600 mb-4">
                    {step.list.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                )}

                {step.note && (
                  <div className="bg-blue-50 p-4 rounded-lg mt-4">
                    <p className="text-blue-800 text-sm">{step.note}</p>
                  </div>
                )}

                {step.cards && (
                  <div className="space-y-3">
                    {step.cards.map((card, j) => (
                      <div key={j} className={`${card.bg} p-3 rounded-lg`}>
                        <p className={`${card.titleColor} text-sm font-medium mb-1`}>{card.title}</p>
                        <p className={`${card.textColor} text-sm`}>{card.text}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Configuration Options</h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="table-header">Option</th>
                <th className="table-header">Default</th>
                <th className="table-header">Description</th>
              </tr>
            </thead>
            <tbody>
              {configOptions.map((opt) => (
                <tr key={opt.option} className="border-b border-gray-50">
                  <td className="table-cell text-sm font-medium font-mono text-gray-900">{opt.option}</td>
                  <td className="table-cell text-sm text-gray-500 font-mono">{opt.default}</td>
                  <td className="table-cell text-sm text-gray-600">{opt.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">What's Next?</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">View Sessions</h4>
            <p className="text-sm text-gray-600 mb-3">
              Browse recorded sessions and analyze user behavior.
            </p>
            <Link href="/sessions" className="btn btn-primary text-sm">
              Go to Sessions
            </Link>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg">
            <h4 className="font-medium text-gray-900 mb-2">Monitor Tests</h4>
            <p className="text-sm text-gray-600 mb-3">
              Track test execution and visual regression results.
            </p>
            <Link href="/tests" className="btn btn-primary text-sm">
              Go to Tests
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
