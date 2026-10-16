import {
    useEffect,
    useState,
  } from 'react';
  
  import {
    BriefcaseBusiness,
    Loader2,
    ArrowRight,
  } from 'lucide-react';
  
  import {
    Link,
  } from 'react-router-dom';
  
  import Navbar from '@/components/layout/Navbar/Navbar';
  import Footer from '@/components/layout/Footer/Footer';
  
  import {
    Button,
  } from '@/components/ui/button';
  
  import {
    Badge,
  } from '@/components/ui/badge';
  
  import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
  } from '@/components/ui/card';
  
  import {
    getInternships,
  } from '@/features/internships/services/internships.service';
  
  import type {
    Internship,
  } from '@/features/internships/types';
  
  export default function Internships() {
    const [
      internships,
      setInternships,
    ] =
      useState<Internship[]>([]);
  
    const [
      loading,
      setLoading,
    ] =
      useState(true);
  
    const [
      error,
      setError,
    ] =
      useState<string | null>(
        null,
      );
  
    useEffect(() => {
      const loadInternships =
        async () => {
          try {
            setLoading(true);
            setError(null);
  
            const data =
              await getInternships();
  
            setInternships(
              data.filter(
                (internship) =>
                  internship.isActive,
              ),
            );
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : 'Unable to load internships.',
            );
          } finally {
            setLoading(false);
          }
        };
  
      void loadInternships();
    }, []);
  
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />
  
        <main className="flex-1">
          {/* Header */}
          <section className="border-b bg-muted/30">
            <div className="mx-auto max-w-7xl px-6 py-16">
              <div className="max-w-3xl">
                <Badge
                  variant="secondary"
                  className="mb-4"
                >
                  Internship Opportunities
                </Badge>
  
                <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
                  Explore available internships
                </h1>
  
                <p className="mt-4 max-w-2xl text-muted-foreground">
                  Browse currently available
                  internship opportunities and
                  apply directly through the portal.
                </p>
              </div>
            </div>
          </section>
  
          {/* Content */}
          <section className="mx-auto w-full max-w-7xl px-6 py-12">
            {loading && (
              <div className="flex min-h-[300px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}
  
            {!loading && error && (
              <Card className="mx-auto max-w-xl">
                <CardContent className="p-8 text-center">
                  <h2 className="text-lg font-semibold">
                    Unable to load internships
                  </h2>
  
                  <p className="mt-2 text-sm text-muted-foreground">
                    {error}
                  </p>
                </CardContent>
              </Card>
            )}
  
            {!loading &&
              !error &&
              internships.length === 0 && (
                <Card className="mx-auto max-w-xl">
                  <CardContent className="p-8 text-center">
                    <BriefcaseBusiness className="mx-auto h-10 w-10 text-muted-foreground" />
  
                    <h2 className="mt-4 text-lg font-semibold">
                      No active internships
                    </h2>
  
                    <p className="mt-2 text-sm text-muted-foreground">
                      There are currently no
                      internship opportunities
                      available.
                    </p>
  
                    <Link to="/apply">
                      <Button
                        variant="outline"
                        className="mt-6"
                      >
                        Request Another Training Area
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              )}
  
            {!loading &&
              !error &&
              internships.length > 0 && (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                  {internships.map(
                    (internship) => (
                      <Card
                        key={internship.id}
                        className="flex h-full flex-col"
                      >
                        <CardHeader>
                          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10">
                            <BriefcaseBusiness className="h-5 w-5 text-primary" />
                          </div>
  
                          <CardTitle>
                            {internship.title}
                          </CardTitle>
                        </CardHeader>
  
                        <CardContent className="flex flex-1 flex-col">
                          <div className="mt-auto pt-6">
                            <Link
                              to={`/apply?internshipId=${internship.id}`}
                            >
                              <Button className="w-full">
                                Apply Now
  
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </Button>
                            </Link>
                          </div>
                        </CardContent>
                      </Card>
                    ),
                  )}
                </div>
              )}
          </section>
        </main>
  
        <Footer />
      </div>
    );
  }