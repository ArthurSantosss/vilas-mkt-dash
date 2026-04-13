import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import ProgressiveBlur from '../shared/components/ProgressiveBlur';

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-bg">
      <Sidebar />
      <main className="lg:ml-60 px-3 sm:px-4 py-4 pt-16 lg:px-8 lg:py-6 lg:pt-6 pb-24 lg:pb-6 min-h-screen">
        <Outlet />
      </main>
      <ProgressiveBlur />
    </div>
  );
}
