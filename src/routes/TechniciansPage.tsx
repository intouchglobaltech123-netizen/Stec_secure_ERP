import React, { useState } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { User, Job, JobStatus } from '@/lib/stecsecure-types';
import {
  HardHat,
  Phone,
  Mail,
  KeyRound,
  Wrench,
  Shield,
  Eye,
  EyeOff,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Package,
  Calendar,
  Search,
  ArrowLeft,
  ChevronRight,
  Layers,
  Filter,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDate, formatDateTime, formatINR } from '@/lib/utils';
import { JobDetailModal } from '@/components/jobs/JobDetailModal';

export const TechniciansPage: React.FC = () => {
  const { users, jobs, visibleJobs, currentUser, getTechnicianStats, getCustomer, materialUsages } = useStecSecure();

  // Detail panel state
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // CEO PIN reveal toggle state: map of userId -> boolean
  const [revealedPins, setRevealedPins] = useState<Record<string, boolean>>({});

  // History filters
  const [historyStatusFilter, setHistoryStatusFilter] = useState<'ALL' | JobStatus>('ALL');
  const [historySearch, setHistorySearch] = useState('');

  // Selected job for deep inspection modal
  const [inspectedJob, setInspectedJob] = useState<Job | null>(null);

  const isCeo = currentUser?.role === 'CEO';

  const toggleRevealPin = (userId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCeo) return;
    setRevealedPins((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  const selectedUser = users.find((u) => u.id === selectedUserId);

  // If a user is selected, calculate deep profile stats
  const userStats = selectedUser ? getTechnicianStats(selectedUser.id) : null;

  // Filtered job history for selected user (strictly scoped for technicians)
  const baseJobs = currentUser?.role === 'TECHNICIAN' ? visibleJobs : jobs;

  const userJobs = selectedUser
    ? baseJobs.filter((j) => {
        const isAssigned = j.assignedTeam.includes(selectedUser.id);
        const matchesStatus = historyStatusFilter === 'ALL' || j.status === historyStatusFilter;
        const cust = getCustomer(j.customerNumber);
        const matchesSearch =
          j.jobNumber.toLowerCase().includes(historySearch.toLowerCase()) ||
          (j.productModel && j.productModel.toLowerCase().includes(historySearch.toLowerCase())) ||
          (cust && cust.name.toLowerCase().includes(historySearch.toLowerCase()));
        return isAssigned && matchesStatus && matchesSearch;
      })
    : [];

  // Aggregated materials tied to this technician's jobs
  const userAssignedJobIds = selectedUser
    ? baseJobs.filter((j) => j.assignedTeam.includes(selectedUser.id)).map((j) => j.id)
    : [];

  const userMaterialsMap: Record<string, { name: string; delivered: number; returned: number }> = {};
  if (selectedUser) {
    materialUsages
      .filter((m) => userAssignedJobIds.includes(m.jobId))
      .forEach((m) => {
        if (!userMaterialsMap[m.materialName]) {
          userMaterialsMap[m.materialName] = { name: m.materialName, delivered: 0, returned: 0 };
        }
        userMaterialsMap[m.materialName].delivered += m.deliveredQty;
        userMaterialsMap[m.materialName].returned += m.returnedQty;
      });
  }

  return (
    <div className="space-y-6">
      {/* DIRECTORY VIEW (When no technician is selected) */}
      {!selectedUser ? (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="orange" className="text-xs">
                  <HardHat className="w-3.5 h-3.5 text-orange-600" />
                  Field Operations Crew
                </Badge>
                <span className="text-xs text-slate-500 font-medium">
                  {users.filter((u) => u.role === 'TECHNICIAN').length} Active Technicians &bull; 2 Managers
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
                Technician Roster & Directory
              </h1>
              <p className="text-xs sm:text-sm text-slate-500">
                Click any technician to review their full deployment history, logged hours, and job performance
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {users.map((user) => {
              const stats = getTechnicianStats(user.id);
              const isCurrentUser = currentUser?.id === user.id;
              const isPinRevealed = revealedPins[user.id];

              const roleVariant =
                user.role === 'CEO'
                  ? 'orange'
                  : user.role === 'MANAGER'
                  ? 'default'
                  : 'success';

              return (
                <Card
                  key={user.id}
                  onClick={() => setSelectedUserId(user.id)}
                  className={`border-slate-200 bg-white shadow-sm hover:border-orange-300 hover:shadow-md transition-all cursor-pointer relative overflow-hidden ${
                    isCurrentUser ? 'ring-2 ring-orange-400 border-orange-300' : ''
                  }`}
                >
                  {isCurrentUser && (
                    <div className="absolute top-0 right-0 bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg">
                      YOU
                    </div>
                  )}

                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={roleVariant} className="text-xs font-semibold">
                        {user.role}
                      </Badge>

                      {/* Masked PIN with CEO reveal toggle */}
                      <div className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                        <KeyRound className="w-3 h-3 text-slate-400" />
                        <span className="font-mono text-xs text-slate-700">
                          {isCeo && isPinRevealed ? user.pin : '••••'}
                        </span>
                        {isCeo && (
                          <button
                            type="button"
                            onClick={(e) => toggleRevealPin(user.id, e)}
                            title={isPinRevealed ? 'Hide PIN' : 'Reveal PIN (CEO Only)'}
                            className="text-slate-400 hover:text-slate-800 cursor-pointer ml-1"
                          >
                            {isPinRevealed ? (
                              <EyeOff className="w-3 h-3" />
                            ) : (
                              <Eye className="w-3 h-3" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 mt-3">
                      <div className="w-12 h-12 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-base font-bold text-orange-700 shadow-2xs">
                        {user.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base text-slate-900 truncate font-display">
                          {user.name}
                        </CardTitle>
                        <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5 font-medium">
                          <Phone className="w-3 h-3 text-slate-400" /> {user.phone}
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-slate-400" />
                    </div>
                  </CardHeader>

                  <CardContent className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                    <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-xl bg-slate-50 border border-slate-200">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Active</div>
                        <div className="text-base font-bold text-amber-800 mt-0.5 font-mono">
                          {stats.activeJobs}
                        </div>
                      </div>
                      <div className="border-x border-slate-200">
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Done</div>
                        <div className="text-base font-bold text-emerald-700 mt-0.5 font-mono">
                          {stats.completedJobs}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-bold">Hours</div>
                        <div className="text-base font-bold text-blue-700 mt-0.5 font-mono">
                          {stats.totalHoursLogged}h
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-600 pt-1">
                      <span>Total Jobs Assigned:</span>
                      <strong className="text-slate-900 font-mono">{stats.totalJobs}</strong>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        /* DETAIL VIEW (When technician is clicked) */
        <div className="space-y-6">
          {/* Back Navigation & Breadcrumb */}
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setSelectedUserId(null)}
              className="flex items-center gap-2 text-xs font-semibold text-orange-600 hover:text-orange-700 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Technicians Directory
            </button>
            <Badge variant="outline" className="text-xs">
              Technician Profile ID: {selectedUser.id}
            </Badge>
          </div>

          {/* Profile Header Card */}
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-orange-100 border border-orange-200 flex items-center justify-center text-2xl font-black text-orange-700 shadow-sm">
                    {selectedUser.name.charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h1 className="text-xl font-bold text-slate-900 font-display">
                        {selectedUser.name}
                      </h1>
                      <Badge
                        variant={
                          selectedUser.role === 'CEO'
                            ? 'orange'
                            : selectedUser.role === 'MANAGER'
                            ? 'default'
                            : 'success'
                        }
                      >
                        {selectedUser.role}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 mt-1">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-orange-600" /> {selectedUser.phone}
                      </span>
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5 text-slate-500" /> {selectedUser.email || `${selectedUser.name.toLowerCase().replace(/\s+/g, '.')}@stecsecure.com`}
                      </span>
                      <span className="font-mono text-slate-500">
                        PIN: {isCeo && revealedPins[selectedUser.id] ? selectedUser.pin : '••••'}
                      </span>
                      {isCeo && (
                        <button
                          type="button"
                          onClick={(e) => toggleRevealPin(selectedUser.id, e)}
                          className="text-xs text-orange-600 underline cursor-pointer font-semibold"
                        >
                          {revealedPins[selectedUser.id] ? 'Hide' : 'Reveal'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-right sm:border-l sm:border-slate-200 sm:pl-6 text-xs text-slate-500">
                  <div className="text-[10px] uppercase font-bold text-slate-500">Security Clearance</div>
                  <div className="text-slate-900 font-semibold mt-0.5">Level 2 Field Certified</div>
                  <div className="text-[11px] text-emerald-700 flex items-center gap-1 justify-end mt-1 font-semibold">
                    <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Active Duty Roster
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 5 Stats Tiles */}
          {userStats && (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* Total Jobs */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-3.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-slate-500 flex items-center justify-between">
                    <span>Total Jobs</span>
                    <Wrench className="w-3.5 h-3.5 text-orange-600" />
                  </div>
                  <div className="text-2xl font-bold text-slate-900 font-mono">{userStats.totalJobs}</div>
                  <p className="text-[10px] text-slate-500">Across lifetime</p>
                </CardContent>
              </Card>

              {/* Total Hours Worked */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-3.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-blue-700 flex items-center justify-between">
                    <span>Hours Logged</span>
                    <Clock className="w-3.5 h-3.5 text-blue-600" />
                  </div>
                  <div className="text-2xl font-bold text-blue-700 font-mono">{userStats.totalHoursLogged}h</div>
                  <p className="text-[10px] text-slate-500">WorkLog duration</p>
                </CardContent>
              </Card>

              {/* Currently Active */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-3.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-amber-800 flex items-center justify-between">
                    <span>Active Now</span>
                    <Layers className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  <div className="text-2xl font-bold text-amber-800 font-mono">{userStats.activeJobs}</div>
                  <p className="text-[10px] text-slate-500">Field deployments</p>
                </CardContent>
              </Card>

              {/* Holds Raised */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-3.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-rose-700 flex items-center justify-between">
                    <span>Holds Raised</span>
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  </div>
                  <div className="text-2xl font-bold text-rose-700 font-mono">{userStats.holdsRaised}</div>
                  <p className="text-[10px] text-slate-500">Site impediment events</p>
                </CardContent>
              </Card>

              {/* Avg Job Completion Time */}
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="p-3.5 space-y-1">
                  <div className="text-[10px] uppercase font-bold text-emerald-700 flex items-center justify-between">
                    <span>Avg Duration</span>
                    <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-2xl font-bold text-emerald-700 font-mono">
                    {userStats.avgDurationHours}h
                  </div>
                  <p className="text-[10px] text-slate-500">Per closed job</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Aggregated Materials Used Table */}
          {Object.keys(userMaterialsMap).length > 0 && (
            <Card className="border-slate-200 bg-white shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-orange-600" />
                  Materials Handled & Consumed Across Jobs
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {Object.values(userMaterialsMap).map((m) => (
                    <div
                      key={m.name}
                      className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                    >
                      <div className="font-semibold text-slate-800 truncate">{m.name}</div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Delivered: {m.delivered}</span>
                        <span className="text-orange-600 font-bold">Net: {m.delivered - m.returned}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Full Job History Table */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Assigned Job History ({userJobs.length})</h3>
                <p className="text-xs text-slate-500">
                  Every past and active job assigned to {selectedUser.name}. Click any row to view full job details.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative w-48">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                  <Input
                    placeholder="Search jobs..."
                    value={historySearch}
                    onChange={(e) => setHistorySearch(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white"
                  />
                </div>

                <select
                  value={historyStatusFilter}
                  onChange={(e) => setHistoryStatusFilter(e.target.value as any)}
                  className="h-8 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-900 focus:outline-none"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="IN_PROGRESS">IN_PROGRESS</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CLOSED">CLOSED</option>
                  <option value="ON_HOLD">ON_HOLD</option>
                  <option value="ASSIGNED">ASSIGNED</option>
                </select>
              </div>
            </div>

            <Card className="border-slate-200 bg-white shadow-sm overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="p-3">Job Number</th>
                        <th className="p-3">Customer / Site</th>
                        <th className="p-3">Category</th>
                        <th className="p-3">Product Model</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Date</th>
                        <th className="p-3 text-right">Inspect</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {userJobs.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="p-6 text-center text-slate-500 italic">
                            No jobs found for this filter criteria.
                          </td>
                        </tr>
                      ) : (
                        userJobs.map((j) => {
                          const customer = getCustomer(j.customerNumber);
                          const statusVariant =
                            j.status === 'CLOSED'
                              ? 'success'
                              : j.status === 'COMPLETED'
                              ? 'default'
                              : j.status === 'IN_PROGRESS'
                              ? 'default'
                              : j.status === 'ON_HOLD'
                              ? 'danger'
                              : 'secondary';

                          return (
                            <tr
                              key={j.id}
                              onClick={() => setInspectedJob(j)}
                              className="hover:bg-slate-50 cursor-pointer transition-colors"
                            >
                              <td className="p-3 font-mono font-bold text-orange-600">
                                {j.jobNumber}
                              </td>
                              <td className="p-3">
                                <div className="font-semibold text-slate-900">{customer?.name}</div>
                                <div className="text-[11px] text-slate-500">{customer?.address}</div>
                              </td>
                              <td className="p-3">
                                <Badge variant="outline" className="text-[10px]">
                                  {j.category}
                                </Badge>
                              </td>
                              <td className="p-3 font-medium text-slate-800">
                                {j.productModel}
                              </td>
                              <td className="p-3">
                                <Badge variant={statusVariant} className="text-[10px]">
                                  {j.status}
                                </Badge>
                              </td>
                              <td className="p-3 text-slate-500 font-mono text-[11px]">
                                {formatDate(j.createdAt)}
                              </td>
                              <td className="p-3 text-right">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 text-[11px]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setInspectedJob(j);
                                  }}
                                >
                                  View Detail
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
      <JobDetailModal
        isOpen={Boolean(inspectedJob)}
        job={inspectedJob}
        onClose={() => setInspectedJob(null)}
      />
    </div>
  );
};
