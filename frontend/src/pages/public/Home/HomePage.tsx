import { Link } from 'react-router-dom';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import Navbar from '@/components/layout/Navbar/Navbar';
import Footer from '@/components/layout/Footer/Footer';
import { useAuth } from '@/features/auth/auth-context';

export default function HomePage() {
  const {
    user,
    role,
  } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* =========================
            Hero Section
           ========================= */}

        <section className="relative overflow-hidden border-b">
          {/* Decorative background */}
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute left-1/2 top-0 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
          </div>

          <div className="mx-auto max-w-7xl px-6 py-24 md:py-32">
            <div className="mx-auto max-w-4xl text-center">
              <Badge
                variant="secondary"
                className="mb-6 px-4 py-1.5"
              >
                Internship Recruitment Platform
              </Badge>

              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
                Start your career
                <br />

                <span className="text-primary">
                  with the right opportunity
                </span>
              </h1>

              <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
                Discover internship opportunities, apply with
                ease, and follow your recruitment journey from
                application to selection — all in one place.
              </p>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Link to="/internships">
                  <Button
                    size="lg"
                    className="min-w-44"
                  >
                    Explore Internships
                  </Button>
                </Link>

                {/* Guest */}
                {!user && (
                  <Link to="/login">
                    <Button
                      size="lg"
                      variant="outline"
                      className="min-w-44"
                    >
                      Sign In
                    </Button>
                  </Link>
                )}

                {/* Applicant */}
                {user &&
                  role ===
                    'APPLICANT' && (
                    <Link to="/applicant/profile">
                      <Button
                        size="lg"
                        variant="outline"
                        className="min-w-44"
                      >
                        My Profile
                      </Button>
                    </Link>
                  )}

                {/* HR */}
                {user &&
                  role === 'HR' && (
                    <Link to="/hr/dashboard">
                      <Button
                        size="lg"
                        variant="outline"
                        className="min-w-44"
                      >
                        HR Dashboard
                      </Button>
                    </Link>
                  )}

                {/* Intern */}
                {user &&
                  role ===
                    'INTERN' && (
                    <Link to="/intern">
                      <Button
                        size="lg"
                        variant="outline"
                        className="min-w-44"
                      >
                        Intern Portal
                      </Button>
                    </Link>
                  )}

                {/* Mentor */}
                {user &&
                  role ===
                    'MENTOR' && (
                    <Link to="/mentor">
                      <Button size="lg" variant="outline" className="min-w-44">
                        Mentor Portal
                      </Button>
                    </Link>
                  )}
              </div>

              <p className="mt-5 text-xs text-muted-foreground">
                Find opportunities. Build experience. Grow your
                career.
              </p>
            </div>
          </div>
        </section>

        {/* =========================
            Platform Features
           ========================= */}

        <section className="bg-muted/30">
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="mx-auto mb-12 max-w-2xl text-center">
              <p className="text-sm font-medium text-primary">
                ONE CENTRALIZED PLATFORM
              </p>

              <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                Everything you need for your internship journey
              </h2>

              <p className="mt-4 text-muted-foreground">
                From discovering opportunities to tracking your
                application, every step is managed through one
                centralized platform.
              </p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
              {/* Card 1 */}
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    01
                  </div>

                  <CardTitle>
                    Discover Opportunities
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Browse available internship positions,
                    explore their requirements, and find
                    opportunities that match your skills and
                    interests.
                  </p>
                </CardContent>
              </Card>

              {/* Card 2 */}
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    02
                  </div>

                  <CardTitle>
                    Apply Smarter
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Upload your CV and let our intelligent
                    processing system extract your information
                    to simplify the application process.
                  </p>
                </CardContent>
              </Card>

              {/* Card 3 */}
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    03
                  </div>

                  <CardTitle>
                    Track Your Journey
                  </CardTitle>
                </CardHeader>

                <CardContent>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Stay informed about your application status,
                    interviews, evaluations, and recruitment
                    progress.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* =========================
            How It Works
           ========================= */}

        <section>
          <div className="mx-auto max-w-7xl px-6 py-20 md:py-24">
            <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
              <div>
                <p className="text-sm font-medium text-primary">
                  HOW IT WORKS
                </p>

                <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
                  From application to opportunity
                </h2>

                <p className="mt-4 max-w-xl text-muted-foreground">
                  Our recruitment platform organizes the
                  entire internship application process into a
                  clear and transparent journey.
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex gap-4 rounded-xl border bg-card p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    1
                  </div>

                  <div>
                    <h3 className="font-semibold">
                      Create your account
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Set up your profile and provide your basic
                      information.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-xl border bg-card p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    2
                  </div>

                  <div>
                    <h3 className="font-semibold">
                      Upload your CV
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Our system extracts relevant information
                      from your CV.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-xl border bg-card p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    3
                  </div>

                  <div>
                    <h3 className="font-semibold">
                      Review your application
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Review the extracted information and
                      correct anything before submitting.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4 rounded-xl border bg-card p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    4
                  </div>

                  <div>
                    <h3 className="font-semibold">
                      Follow your recruitment journey
                    </h3>

                    <p className="mt-1 text-sm text-muted-foreground">
                      Track your application through screening,
                      interviews, and the final decision.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* =========================
            CTA
           ========================= */}

        <section className="border-t bg-primary">
          <div className="mx-auto max-w-7xl px-6 py-16">
            <div className="flex flex-col items-center justify-between gap-6 text-center md:flex-row md:text-left">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight text-primary-foreground sm:text-3xl">
                  Ready to start your internship journey?
                </h2>

                <p className="mt-2 text-sm text-primary-foreground/75">
                  Explore current internship opportunities and
                  take the next step in your career.
                </p>
              </div>

              <Link to="/internships">
                <Button
                  size="lg"
                  variant="secondary"
                  className="min-w-40"
                >
                  View Internships
                </Button>
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
