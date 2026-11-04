import { NextResponse } from "next/server";

import { auth } from "@/auth";

import { prisma } from "@/lib/prisma";



export const GET = auth(async function GET(request) {

    try {

        const authUserId = request.auth?.user?.id;



        if (!authUserId) {

            return NextResponse.json(

                { error: "Unauthorized" },

                { status: 401 }

            );

        }


        const membership = await prisma.organizationMember.findFirst({

            where: { userId: authUserId },

            select: { organizationId: true },

            orderBy: { createdAt: "asc" },

        });



        if (!membership) {

            return NextResponse.json(

                { error: "Organization not found" },

                { status: 404 }

            );

        }



        const { searchParams } = new URL(request.url);

        const projectId = searchParams.get("projectId");



        const now = new Date();




        const startDate = new Date(now);

        startDate.setDate(startDate.getDate() - 30);

        const activeThreshold = startDate;

        if (projectId && projectId !== "All") {

            const project = await prisma.project.findFirst({

                where: {

                    id: projectId,

                    organizationId: membership.organizationId,

                },

                select: { id: true },

            });



            if (!project) {

                return NextResponse.json(

                    { error: "Project not found or access denied" },

                    { status: 404 }

                );

            }

        }

        const projectFilter = {

            project: {

                organizationId: membership.organizationId,

            },

            ...(projectId && projectId !== "All"

                ? { projectId }

                : {}),

        };



        // Fetch events from the last 30 days

        const events = await prisma.analyticsEvent.findMany({

            where: {

                ...projectFilter,

                createdAt: {

                    gte: startDate,

                    lte: now,

                },

                userId: {

                    not: null,

                },

            },

            select: {

                id: true,

                userId: true,

                sessionId: true,

                eventName: true,

                pageUrl: true,

                device: true,

                country: true,

                createdAt: true,

            },

            orderBy: {

                createdAt: "asc",

            },

        });

        const allTimeUserFirstSeen =

            await prisma.analyticsEvent.groupBy({

                by: ["userId"],

                where: {

                    ...projectFilter,

                    userId: {

                        not: null,

                    },

                },

                _min: {

                    createdAt: true,

                },

            });


        const firstSeenMap = new Map<string, Date>();



        for (const user of allTimeUserFirstSeen) {

            if (user.userId && user._min.createdAt) {

                firstSeenMap.set(

                    user.userId,

                    user._min.createdAt

                );

            }

        }

        const userMap = new Map<

            string,

            {

                id: string;

                totalEvents: number;

                sessions: Set<string>;

                firstSeen: Date;

                lastSeen: Date;

                country: string;

                device: string;

                topPages: Map<string, number>;

                recentEvents: typeof events;

            }

        >();



        for (const event of events) {

            if (!event.userId) continue;



            if (!userMap.has(event.userId)) {

                userMap.set(event.userId, {

                    id: event.userId,

                    totalEvents: 0,

                    sessions: new Set(),

                    firstSeen:

                        firstSeenMap.get(event.userId) ??

                        event.createdAt,

                    lastSeen: event.createdAt,

                    country: event.country || "Unknown",

                    device: event.device || "Unknown",

                    topPages: new Map(),

                    recentEvents: [],

                });

            }



            const user = userMap.get(event.userId)!;



            user.totalEvents += 1;



            if (event.sessionId) {

                user.sessions.add(event.sessionId);

            }



            
            const historicalFirstSeen =

                firstSeenMap.get(event.userId);



            if (

                historicalFirstSeen &&

                historicalFirstSeen < user.firstSeen

            ) {

                user.firstSeen = historicalFirstSeen;

            }



            if (event.createdAt > user.lastSeen) {

                user.lastSeen = event.createdAt;

            }



            if (event.country) {

                user.country = event.country;

            }



            if (event.device) {

                user.device = event.device;

            }



            if (event.pageUrl) {

                user.topPages.set(

                    event.pageUrl,

                    (user.topPages.get(event.pageUrl) || 0) + 1

                );

            }



            user.recentEvents.push(event);

        }




        const users = Array.from(userMap.values()).map((user) => {

            const topPages = Array.from(user.topPages.entries())

                .map(([url, visits]) => ({

                    url,

                    visits,

                }))

                .sort((a, b) => b.visits - a.visits)

                .slice(0, 5);



            const recentEvents = user.recentEvents

                .slice(-5)

                .reverse()

                .map((event) => ({

                    id: event.id,

                    name: event.eventName,

                    page: event.pageUrl || "—",

                    timestamp: event.createdAt.toISOString(),

                }))


            const status =
                user.lastSeen >= activeThreshold
                    ? "active"
                    : "inactive";
            return {
                id: user.id,
                // No name/email fields exist in AnalyticsEvent.
                // Keep the ID as a fallback display value.
                name: user.id,
                email: user.id,

                country: user.country,
                device: user.device,
                // First-ever event, not just first event in the range
                firstSeen: user.firstSeen.toISOString(),
                lastSeen: user.lastSeen.toISOString(),
                totalEvents: user.totalEvents,
                sessionsCount: user.sessions.size,
                status,
                topPages,
                timeline: [
                    {
                        id: `${user.id}-first`,

                        action: "First seen",

                        timestamp: user.firstSeen.toISOString(),

                    },

                    {

                        id: `${user.id}-last`,

                        action: "Last activity",

                        timestamp: user.lastSeen.toISOString(),

                    },

                ],

                recentEvents,

            };

        });



        // KPI calculations



        // Total identified users ever seen in this organization/project

        const totalUsers = firstSeenMap.size;



        // New users: first-ever activity within the last 30 days

        const newUsers = Array.from(firstSeenMap.values()).filter(

            (firstSeen) => firstSeen >= startDate

        ).length;



        // Active users: identified users with activity in the last 30 days

        const activeUsers = users.filter(

            (user) => new Date(user.lastSeen) >= activeThreshold

        ).length;



        // Returning users: active in the last 30 days,

        // but first seen before the last 30 days

        const returningUsers = users.filter((user) => {

            const firstSeen = new Date(user.firstSeen);



            return (

                new Date(user.lastSeen) >= activeThreshold &&

                firstSeen < startDate

            );

        }).length;



        // Unique sessions in the last 30 days

        const totalSessions = new Set(

            events

                .map((event) => event.sessionId)

                .filter((sessionId): sessionId is string =>

                    Boolean(sessionId)

                )

        ).size;



        // Daily unique active users

        const dailyMap = new Map<string, Set<string>>();



        for (const event of events) {

            if (!event.userId) continue;



            const dateKey = event.createdAt

                .toISOString()

                .slice(0, 10);



            if (!dailyMap.has(dateKey)) {

                dailyMap.set(dateKey, new Set());

            }



            dailyMap.get(dateKey)!.add(event.userId);

        }



        const dailyUsers = [];



        for (let i = 29; i >= 0; i--) {

            const date = new Date(now);

            date.setDate(date.getDate() - i);



            const dateKey = date.toISOString().slice(0, 10);



            dailyUsers.push({

                date: dateKey,

                count: dailyMap.get(dateKey)?.size || 0,

            });

        }



        return NextResponse.json({

            success: true,

            data: {

                users,

                dailyUsers,



                totalUsers,

                newUsers,

                returningUsers,

                activeUsers,

                totalSessions,



                range: "30d",

            },

        });

    } catch (error) {

        console.error("Users Analytics API Error:", error);



        return NextResponse.json(

            { error: "Failed to fetch users analytics" },

            { status: 500 }

        );

    }

});