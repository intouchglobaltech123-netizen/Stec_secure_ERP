import React, { useState, useMemo } from 'react';
import { useStecSecure } from '@/lib/stecsecure-context';
import { Customer } from '@/lib/stecsecure-types';
import {
  Users,
  Phone,
  MapPin,
  Building,
  Plus,
  Edit,
  ExternalLink,
  Search,
  Navigation,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CustomerModal } from '@/components/customers/CustomerModal';
import { SiteLocationModal } from '@/components/customers/SiteLocationModal';

export const CustomersPage: React.FC = () => {
  const { customers, visibleJobs, invoices, isManagement } = useStecSecure();

  const [search, setSearch] = useState('');
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [selectedCustomerForEdit, setSelectedCustomerForEdit] = useState<Customer | null>(null);
  const [selectedCustomerForLocation, setSelectedCustomerForLocation] = useState<Customer | null>(null);

  const filteredCustomers = useMemo(() => {
    if (!search.trim()) return customers;
    const q = search.toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        c.address.toLowerCase().includes(q) ||
        (c.contactPerson && c.contactPerson.toLowerCase().includes(q)) ||
        (c.gstin && c.gstin.toLowerCase().includes(q))
    );
  }, [customers, search]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="orange" className="text-xs">
              <Users className="w-3.5 h-3.5 text-orange-600" />
              Client Registry & Site Maps
            </Badge>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight font-display">
            Customer Directory & Accounts
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            Clients, residential societies, GPS site map links, and live outstanding balance tracking
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setSelectedCustomerForEdit(null);
              setIsCustomerModalOpen(true);
            }}
            className="text-xs font-semibold"
          >
            <Plus className="w-4 h-4 mr-1" /> Add Customer
          </Button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative flex-1 w-full sm:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <Input
            placeholder="Search customers by name, phone, address, or GST..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-xs bg-white"
          />
        </div>
        <div className="text-xs text-slate-500 font-medium">
          Showing {filteredCustomers.length} of {customers.length} client accounts
        </div>
      </div>

      {/* Customer Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((cust) => {
          const customerJobs = visibleJobs.filter((j) => j.customerNumber === cust.id);
          const custInvoices = invoices.filter((i) => i.customerNumber === cust.id);
          const totalBilled = custInvoices.reduce((sum, i) => sum + i.grandTotal, 0);
          const totalPaid = custInvoices.reduce((sum, i) => sum + i.amountPaid, 0);
          const outstandingBalance = custInvoices.reduce((sum, i) => sum + i.balanceDue, 0);

          return (
            <Card
              key={cust.id}
              className="border-slate-200 bg-white shadow-sm hover:border-orange-300 transition-all flex flex-col justify-between"
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs text-orange-600 font-bold">{cust.id}</span>
                    {cust.siteLocationMapLink && (
                      <Badge variant="outline" className="text-[9px] bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1">
                        <MapPin className="w-2.5 h-2.5 text-blue-600" /> Map Pinned
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {customerJobs.length} Jobs
                    </Badge>
                    {outstandingBalance > 0 ? (
                      <Badge variant="danger" className="text-[10px] font-bold">
                        Due: ₹{outstandingBalance.toLocaleString('en-IN')}
                      </Badge>
                    ) : (
                      <Badge variant="success" className="text-[10px]">
                        Cleared
                      </Badge>
                    )}
                  </div>
                </div>

                <CardTitle className="text-base text-slate-900 mt-1 flex items-start justify-between gap-2">
                  <span>{cust.name}</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustomerForEdit(cust);
                      setIsCustomerModalOpen(true);
                    }}
                    className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                    title="Edit Customer"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                </CardTitle>

                {cust.contactPerson && (
                  <p className="text-xs text-slate-500 font-medium">Contact: {cust.contactPerson}</p>
                )}
              </CardHeader>

              <CardContent className="space-y-2.5 text-xs text-slate-700 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 font-medium">
                    <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{cust.phone}</span>
                  </div>

                  <div className="flex items-start gap-2">
                    <Navigation className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-slate-600 leading-snug">{cust.address}</span>
                  </div>

                  {/* Phase 8: Prominent Google Maps Site Location Link */}
                  <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between">
                    {cust.siteLocationMapLink ? (
                      <div className="flex items-center justify-between w-full">
                        <a
                          href={cust.siteLocationMapLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                        >
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span>Open in Google Maps</span>
                          <ExternalLink className="w-3 h-3 ml-0.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerForLocation(cust)}
                          className="text-[10px] text-slate-400 hover:text-slate-700 underline cursor-pointer"
                        >
                          Edit
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="text-[11px] text-slate-400 italic">No GPS map link</span>
                        <button
                          type="button"
                          onClick={() => setSelectedCustomerForLocation(cust)}
                          className="inline-flex items-center gap-1 text-[11px] text-orange-600 hover:text-orange-700 font-semibold cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add site location</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Account Balances */}
                <div className="space-y-2 pt-2">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 grid grid-cols-3 gap-1 text-[11px] text-center pt-1.5">
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Billed</div>
                      <div className="font-mono font-semibold text-slate-800">
                        ₹{totalBilled.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Paid</div>
                      <div className="font-mono font-bold text-emerald-700">
                        ₹{totalPaid.toLocaleString('en-IN')}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-slate-500 uppercase font-bold">Balance</div>
                      <div
                        className={`font-mono font-bold ${
                          outstandingBalance > 0 ? 'text-rose-600' : 'text-slate-500'
                        }`}
                      >
                        ₹{outstandingBalance.toLocaleString('en-IN')}
                      </div>
                    </div>
                  </div>

                  {cust.gstin && (
                    <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                      <Building className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono text-[11px] text-orange-600 font-semibold">
                        GST: {cust.gstin}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Customer Create/Edit Modal */}
      <CustomerModal
        isOpen={isCustomerModalOpen}
        customer={selectedCustomerForEdit}
        onClose={() => {
          setIsCustomerModalOpen(false);
          setSelectedCustomerForEdit(null);
        }}
      />

      {/* Quick Site Location Modal */}
      <SiteLocationModal
        isOpen={Boolean(selectedCustomerForLocation)}
        customer={selectedCustomerForLocation}
        onClose={() => setSelectedCustomerForLocation(null)}
      />
    </div>
  );
};
