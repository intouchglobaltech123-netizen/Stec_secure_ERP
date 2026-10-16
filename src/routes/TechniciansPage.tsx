import React, { useMemo, useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Job, JobStatus, UserRole } from '@/lib/stecsecure-types';
import {
  Phone,
  Mail,
  Wrench,
  Clock,
  AlertTriangle,
  Package,
  Search,
  ArrowLeft,
  ChevronRight,
  Layers,
  CheckCircle2,
  BadgeCheck,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatTile } from '@/components/ui/stat-tile';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { DateRange, inRange, presetRange } from '@/lib/date-range';
import { formatDate, humanize } from '@/lib/utils';
import { JobDetailModal } from '@/components/jobs/JobDetailModal';
import { LeaveCard } from '@/components/technicians/LeaveCard';

const JOB_STATUSES: JobStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'AWAITING_OTP', 'COMPLETED', 'CLOSED', 'CANCELLED'];

const roleVariant = (role: UserRole) => (role === 'CEO' ? 'orange' : role === 'MANAGER' ? 'default' : 'success');

export const TechniciansPage: React.FC = () => {
  const { users, jobs, visibleJobs, currentUser, getTechnicianStats, getCustomer, materialUsages } = useStecSecure();

  // Directory: search and who to show (technicians by default)
  const [directorySearch, setDirectorySearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'TECHNICIAN' | 'ALL'>('TECHNICIAN');

  // Profile
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [range, setRange] = useState<DateRange>(() => presetRange('FY'));
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | JobStatus>('ALL');
  const [historySearch, setHistorySearch] = useState('');
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);

  const directory = useMemo(() => {
    const q = directorySearch.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    return users.filter((u) => {
      if (roleFilter !== 'ALL' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.staffCode || '').toLowerCase().includes(q) ||
        (digits.length > 0 && u.phone.includes(digits))
      );
    });
  }, [users, roleFilter, directorySearch]);

  const selectedUser = users.find((u) => u.id === selectedUserId);
  const userStats = selectedUser ? getTechnicianStats(selectedUser.id, range) : null;

  // The person's jobs in the period (a technician only ever sees their own)
  const baseJobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : jobs;
  const periodJobs = selectedUser
    ? baseJobs.filter(
        (j) => (j.assignedTeam.includes(selectedUser.id) || j.teamLeadUserId === selectedUser.id) && inRange(j.createdAt, range)
      )
    : [];
  const historyQuery = historySearch.trim().toLowerCase();
  const userJobs = periodJobs.filter((j) => {
    if (historyStatusFilter !== 'ALL' && j.status !== historyStatusFilter) return false;
    if (!historyQuery) return true;
    const cust = getCustomer(j.customerNumber);
    return (
      j.jobNumber.toLowerCase().includes(historyQuery) ||
      (j.productModel || '').toLowerCase().includes(historyQuery) ||
      (cust?.name || '').toLowerCase().includes(historyQuery)
    );
  });

  // Materials used on those jobs
  const periodJobIds = new Set(periodJobs.map((j) => j.id));
  const userMaterialsMap: Record<string, { name: string; delivered: number; returned: number }> = {};
  materialUsages
    .filter((m) => periodJobIds.has(m.jobId))
    .forEach((m) => {
      if (!userMaterialsMap[m.materialName]) {
        userMaterialsMap[m.materialName] = { name: m.materialName, delivered: 0, returned: 0 };
      }
      userMaterialsMap[m.materialName].delivered += m.deliveredQty;
      userMaterialsMap[m.materialName].returned += m.returnedQty;
    });

  return (
    <div className="space-y-6">
      {/* DIRECTORY VIEW (When no technician is selected) */}
      {!selectedUser ? (
        <div className="space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">Technicians</h1>
              <p className="hidden sm:block text-sm text-slate-500 mt-0.5">
                Tap a person to see their jobs, hours and performance
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search name, mobile or staff no."
                value={directorySearch}
                onChange={(e) => setDirectorySearch(e.target.value)}
                className="pl-9 h-10 text-[13px] bg-white"
                aria-label="Search staff"
              />
            </div>
            <div className="flex items-center gap-2">
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as 'TECHNICIAN' | 'ALL')}
                aria-label="Who to show"
                className="h-10 rounded-lg border border-slate-300 bg-white px-3 text-[13px] text-slate-900 font-semibold focus:outline-none focus:border-orange-500"
              >
                <option value="TECHNICIAN">Technicians</option>
                <option value="ALL">All staff</option>
              </select>
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{directory.length} shown</span>
            </div>
          </div>

          {directory.length === 0 ? (
            <div className="p-8 rounded-xl bg-white border border-slate-200 text-center text-[13px] text-slate-500">
              Nobody matches “{directorySearch}”.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {directory.map((user) => {
                const stats = getTechnicianStats(user.id);
                const isCurrentUser = currentUser?.id === user.id;
                return (
                  <Card
                    key={user.id}
                    onClick={() => {
                      setSelectedUserId(user.id);
                      setHistorySearch('');
                      setHistoryStatusFilter('ALL');
                    }}
                    className={`border-slate-200 bg-white shadow-sm hover:border-orange-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden ${
                      isCurrentUser ? 'ring-2 ring-orange-400 border-orange-300' : ''
                    }`}
                  >
                    {isCurrentUser && (
                      <div className="absolute top-0 right-0 bg-orange-500 text-white text-[11px] font-bold px-2 py-0.5 rounded-bl-lg">
                        YOU
                      </div>
                    )}

                    <CardHeader className="pb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={roleVariant(user.role)} className="text-[13px] font-semibold">
                          {humanize(user.role)}
                        </Badge>
                        {user.staffCode && (
                          <span className="font-mono text-xs font-bold text-slate-600 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                            {user.staffCode}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 mt-3">
                        <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-base font-bold text-orange-700 shadow-2xs">
                          {user.name.charAt(0)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-base text-slate-900 truncate font-display">{user.name}</CardTitle>
                          <div className="text-[13px] text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                            <Phone className="w-3 h-3 text-slate-400" /> {user.phone}
                          </div>
                        </div>
                        <ChevronRight className="w-5 h-5 text-slate-400" />
                      </div>
                    </CardHeader>

                    <CardContent className="pt-2 border-t border-slate-100 space-y-2 text-[13px]">
                      <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-xl bg-slate-50 border border-slate-200">
                        <div>
                          <div className="text-[11px] text-slate-500 uppercase font-bold">Open</div>
                          <div className="text-base font-bold text-amber-800 mt-0.5 font-mono">{stats.activeJobs}</div>
                        </div>
                        <div className="border-x border-slate-200">
                          <div className="text-[11px] text-slate-500 uppercase font-bold">Done</div>
                          <div className="text-base font-bold text-emerald-700 mt-0.5 font-mono">{stats.completedJobs}</div>
                        </div>
                        <div>
                          <div className="text-[11px] text-slate-500 uppercase font-bold">Hours</div>
                          <div className="text-base font-bold text-blue-700 mt-0.5 font-mono">{stats.totalHoursLogged}h</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                        <span>Jobs assigned (all time)</span>
                        <strong className="text-slate-900 font-mono">{stats.totalJobs}</strong>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* PROFILE (When a person is opened) */
        <div className="space-y-5">
          <button
            type="button"
            onClick={() => setSelectedUserId(null)}
            className="flex items-center gap-2 text-[13px] font-semibold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> All technicians
          </button>

          {/* Profile header */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-2xl font-black text-orange-700 shadow-sm">
                  {selectedUser.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900 font-display">{selectedUser.name}</h1>
                    <Badge variant={roleVariant(selectedUser.role)}>{humanize(selectedUser.role)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-slate-600 mt-1">
                    {selectedUser.staffCode && (
                      <span className="flex items-center gap-1 font-mono font-bold text-slate-800">
                        <BadgeCheck className="w-3.5 h-3.5 text-orange-600" /> {selectedUser.staffCode}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-orange-600" /> {selectedUser.phone}
                    </span>
                    {selectedUser.email && (
                      <span className="flex items-center gap-1 min-w-0">
                        <Mail className="w-3.5 h-3.5 text-slate-500" /> <span className="truncate">{selectedUser.email}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Period for everything below */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <h2 className="text-base font-bold text-slate-900">Performance</h2>
            <DateRangeFilter value={range} onChange={setRange} withTime />
          </div>

          {userStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <StatTile label="Jobs" icon={Wrench} value={userStats.totalJobs} note="Assigned in this period" />
              <StatTile label="Hours worked" icon={Clock} tone="blue" value={`${userStats.totalHoursLogged}h`} note="From the work log" />
              <StatTile label="Still open" icon={Layers} tone="amber" value={userStats.activeJobs} note="Not finished yet" />
              <StatTile label="Finished" icon={CheckCircle2} tone="emerald" value={userStats.completedJobs} note="Completed or closed" />
              <StatTile
                label="Holds raised"
                icon={AlertTriangle}
                tone="rose"
                value={userStats.holdsRaised}
                note={userStats.avgDurationHours === null ? 'No timed jobs yet' : `Avg ${userStats.avgDurationHours}h per finished job`}
                className="col-span-2 md:col-span-1"
              />
            </div>
          )}

          {/* Leave: balance, leave taken in these dates, and recording leave (office) */}
          <LeaveCard user={selectedUser} range={range} />

          {/* Materials used on these jobs */}
          {Object.keys(userMaterialsMap).length > 0 && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-orange-600" />
                  Materials used
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(userMaterialsMap).map((m) => (
                    <div key={m.name} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[13px] space-y-1">
                      <div className="font-semibold text-slate-800 truncate">{m.name}</div>
                      <div className="text-xs text-slate-500 flex justify-between">
                        <span>Given: {m.delivered}</span>
                        <span className="text-orange-600 font-bold">Used: {m.delivered - m.returned}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Job history */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Jobs ({userJobs.length})</h3>
                <p className="hidden sm:block text-[13px] text-slate-500">Tap a job to open it.</p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 sm:w-52 sm:flex-none">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="Search jobs"
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-8 h-9 text-[13px] bg-white"
                  />
                </div>
                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value as 'ALL' | JobStatus)}
                  aria-label="Job status"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-[13px] text-slate-900 focus:outline-none"
                >
                  <option value="ALL">All statuses</option>
                  {JOB_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {humanize(st)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="stack-on-phone w-full text-left text-[13px]">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Job</th>
                        <th className="p-3">Customer / Site</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Product</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3 text-right">Open</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userJobs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                            No jobs for these dates and filters.
                          </td>
                        </tr>
                      ) : (
                        userJobs.map((j) => {
                          const customer = getCustomer(j.customerNumber);
                          const statusVariant =
                            j.status === 'CLOSED'
                              ? 'success'
                              : j.status === 'ON_HOLD'
                              ? 'danger'
                              : j.status === 'COMPLETED' || j.status === 'IN_PROGRESS'
                              ? 'default'
                              : 'secondary';
                          return (
                            <tr key={j.id} onClick={() => setInspectedJob(j)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                              <td className="p-3 font-mono font-bold text-orange-600 whitespace-nowrap">{j.jobNumber}</td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-900">{customer?.name}</div>
                                <div className="text-xs text-slate-500 truncate max-w-[220px]">{customer?.address}</div>
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-[11px]">
                                  {j.category}
                                </Badge>
                              </td>
                              <td className="p-3 font-medium text-slate-800">{j.productModel}</td>
                              <td className="p-3">
                                <Badge variant={statusVariant} className="text-[11px]">
                                  {humanize(j.status)}
                                </Badge>
                              </td>
                              <td className="p-3 text-slate-500 font-mono text-xs whitespace-nowrap">{formatDate(j.createdAt)}</td>
                              <td className="p-3 text-right">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedJob(j);
                                  }}
                                >
                                  Open
                                </Button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Drilldown Job Detail Modal */}
      <JobDetailModal isOpen={Boolean(inspectedJob)} job={inspectedJob} onClose={() => setInspectedJob(null)} />
    </div>
  );
};
