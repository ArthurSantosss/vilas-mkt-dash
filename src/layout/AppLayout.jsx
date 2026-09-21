import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProgressiveBlur from '../shared/components/ProgressiveBlur';
import AssistantWidget from '../modules/assistant/AssistantWidget';

export default function AppLayout() {
  return (
    <div className="min-h-screen min-h-dvh bg-bg overflow-x-clip">
      <Sidebar />
      <main
        className="relative min-h-screen min-h-dvh min-w-0 overflow-x-clip lg:ml-60 px-3 sm:px-4 py-4 pt-16 lg:px-8 lg:py-6 lg:pt-6 pb-24 lg:pb-6"
        style={{
          paddingTop: 'max(4rem, calc(env(safe-area-inset-top, 0px) + 3.25rem))',
          paddingBottom: 'max(6rem, calc(env(safe-area-inset-bottom, 0px) + 5rem))',
          paddingLeft: 'max(0.75rem, calc(env(safe-area-inset-left, 0px) + 0.75rem))',
          paddingRight: 'max(0.75rem, calc(env(safe-area-inset-right, 0px) + 0.75rem))',
        }}
      >
        <Outlet />
      </main>
      <ProgressiveBlur />
      <AssistantWidget />
    </div>
  );
}
