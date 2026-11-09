import { RouterProvider } from 'react-router-dom';
import { browserRouter } from './router.js';

export function App() {
  return <RouterProvider router={browserRouter} />;
}
