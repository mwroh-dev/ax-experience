import { createBrowserRouter } from 'react-router-dom';
import App from './App';
import CasesView from './views/CasesView';
import AutomationRunsView from './views/AutomationRunsView';
import KnowledgeView from './views/KnowledgeView';
import HealthView from './views/HealthView';
import VocReportView from './views/VocReportView';
import VocToolView from './views/VocToolView';
import OpsMetricsView from './views/OpsMetricsView';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <CasesView /> },
      { path: 'runs', element: <AutomationRunsView /> },
      { path: 'knowledge', element: <KnowledgeView /> },
      { path: 'report', element: <VocReportView /> },
      { path: 'health', element: <HealthView /> },
      { path: 'voc', element: <VocToolView /> },
      { path: 'metrics', element: <OpsMetricsView /> },
    ],
  },
]);
