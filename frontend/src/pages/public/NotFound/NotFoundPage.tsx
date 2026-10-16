import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import Navbar from '@/components/layout/Navbar/Navbar';
import Footer from '@/components/layout/Footer/Footer';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex flex-1 items-center justify-center px-6">
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-tight">
            404
          </h1>

          <p className="mt-3 text-muted-foreground">
            The page you are looking for does not exist.
          </p>

          <Link to="/">
            <Button className="mt-6">
              Back to Home
            </Button>
          </Link>
        </div>
      </main>

      <Footer />
    </div>
  );
}
